import crypto from "node:crypto";
import { getStore, connectLambda } from "@netlify/blobs";

const TRASH_DAYS = 30;
// Limite prático de anexos: a função tem teto de 6MB por requisição (payload em
// base64 infla ~33%), então trabalhamos com ~4,8M caracteres de base64 (~3,5MB de arquivos).
const MAX_ATTACH_B64 = 4.8 * 1024 * 1024;

function makeToken() {
  const secret = process.env.ADMIN_PASSWORD || "";
  return crypto.createHmac("sha256", secret).update("nl-admin-v1").digest("base64url");
}
function checkToken(token) {
  if (!token) return false;
  const expected = makeToken();
  const a = Buffer.from(token), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function json(code, obj) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
async function listMessages() {
  const store = getStore("inbox");
  const { blobs } = await store.list();
  const msgs = [];
  for (const blob of blobs) {
    const data = await store.get(blob.key, { type: "json" });
    if (data) msgs.push({ folder: "inbox", favorite: false, ...data });
  }
  msgs.sort((a, b) => (b.receivedAt ?? b.sentAt ?? "").localeCompare(a.receivedAt ?? a.sentAt ?? ""));
  return msgs;
}

const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Remove scripts/eventos/mídia do HTML que sai do editor (segurança + compatibilidade)
function sanitizeOutgoingHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(img|video|audio|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, "");
}

// Monta o HTML final: corpo do editor + assinatura + citação (na resposta)
function buildHtml(bodyHtml, signature, quoteHtml) {
  const sig = signature ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #ddd2c3;font-size:14px;color:#2c2723">${signature}</div>` : "";
  const quote = quoteHtml ? `<div style="margin-top:16px;padding-left:14px;border-left:3px solid #ddd2c3;color:#756b61;font-size:13.5px">${quoteHtml}</div>` : "";
  return `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.7;color:#2c2723">${sanitizeOutgoingHtml(bodyHtml)}</div>${sig}${quote}`;
}

// Versão em texto puro derivada do HTML (para clientes sem HTML)
function buildText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

// Citação da mensagem original (estilo Gmail)
function quoteFromMsg(m) {
  if (!m) return "";
  const when = m.receivedAt || m.sentAt || "";
  const d = when ? new Date(when).toLocaleString("pt-BR") : "";
  const inner = m.html ? sanitizeOutgoingHtml(m.html) : `<p>${escHtml(m.text || "").replace(/\n/g, "<br/>")}</p>`;
  return `<p></p><p style="color:#756b61">Em ${d}, ${escHtml(m.from)} escreveu:</p>${inner}`;
}

// Valida anexos que chegam do painel (base64) antes de encaminhar ao Resend
function sanitizeAttachments(atts) {
  if (!Array.isArray(atts)) return [];
  const out = [];
  let total = 0;
  for (const a of atts.slice(0, 10)) {
    const filename = String(a?.filename || "anexo").slice(0, 120);
    const content = typeof a?.content === "string" ? a.content.replace(/\s/g, "") : "";
    if (!content) continue;
    total += content.length;
    if (total > MAX_ATTACH_B64) break;
    out.push({ filename, content_type: String(a?.content_type || "application/octet-stream").slice(0, 100), content });
  }
  return out;
}

// Anexos de e-mails recebidos: o webhook não traz conteúdo — busca na Attachments
// API do Resend (download_url vale 1h) e guarda no Blobs para download posterior.
async function fetchReceivedAttachments(emailId) {
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.data || data || [];
    const out = [];
    let total = 0;
    for (const a of list.slice(0, 10)) {
      if (!a.download_url) continue;
      const r2 = await fetch(a.download_url);
      if (!r2.ok) continue;
      const buf = Buffer.from(await r2.arrayBuffer());
      const b64 = buf.toString("base64");
      total += b64.length;
      if (total > MAX_ATTACH_B64) break;
      out.push({ filename: a.filename || "anexo", content_type: a.content_type || "application/octet-stream", content: b64 });
    }
    return out;
  } catch (err) { console.error("[inbox] anexos recebidos:", err?.message); return []; }
}

export async function handler(event) {
  try { connectLambda(event); } catch {}
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método não permitido" };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { ok: false, error: "JSON inválido" }); }
  const { action, password, token, id, to, subject, text, html, value } = body;

  if (action === "login") {
    if (!password || password !== process.env.ADMIN_PASSWORD) return json(401, { ok: false, error: "Senha incorreta" });
    return json(200, { ok: true, token: makeToken() });
  }
  if (!checkToken(token)) return json(401, { ok: false, error: "Sessão expirada — entre novamente" });

  const store = getStore("inbox");
  if (action === "list") {
    let msgs = await listMessages();
    // Auto-expiração: e-mails na lixeira há mais de 30 dias são apagados de vez.
    const cutoff = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000;
    for (const m of msgs) {
      if (m.folder === "trash" && new Date(m.receivedAt || m.sentAt || 0).getTime() < cutoff) {
        try { await store.delete(m.id); } catch {}
      }
    }
    msgs = msgs.filter((m) => m.folder !== "trash" || new Date(m.receivedAt || m.sentAt || 0).getTime() >= cutoff);
    return json(200, { ok: true, msgs, unread: msgs.filter((m) => !m.read && m.folder === "inbox").length });
  }
  if (action === "read") {
    const msg = await store.get(id, { type: "json" });
    if (!msg) return json(404, { ok: false, error: "Mensagem não encontrada" });
    if (!msg.read) { await store.setJSON(id, { ...msg, read: true }); msg.read = true; }
    return json(200, { ok: true, msg: { folder: "inbox", favorite: false, ...msg } });
  }
  if (action === "set-meta") {
    const msg = await store.get(id, { type: "json" });
    if (!msg) return json(404, { ok: false, error: "Mensagem não encontrada" });
    const allowedFolder = ["inbox", "archive", "trash", "sent"].includes(value) ? value : msg.folder || "inbox";
    await store.setJSON(id, { ...msg, folder: allowedFolder, favorite: value === "favorite" ? !Boolean(msg.favorite) : Boolean(msg.favorite) });
    return json(200, { ok: true });
  }
  if (action === "delete") { await store.delete(id); return json(200, { ok: true }); }
  if (action === "bulk") {
    // Operações em massa: ids[] + op (trash | archive | inbox | read | unread | delete permanente)
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const op = ["trash", "archive", "inbox", "read", "unread", "delete"].includes(body.op) ? body.op : null;
    if (!op || !ids.length) return json(400, { ok: false, error: "Operação ou lista de e-mails inválida" });
    let done = 0;
    for (const mid of ids.slice(0, 200)) {
      try {
        if (op === "delete") { await store.delete(mid); done++; continue; }
        const msg = await store.get(mid, { type: "json" });
        if (!msg) continue;
        if (op === "read" || op === "unread") await store.setJSON(mid, { ...msg, read: op === "read" });
        else await store.setJSON(mid, { ...msg, folder: op });
        done++;
      } catch (err) { console.error("[bulk] erro em", mid, err?.message); }
    }
    return json(200, { ok: true, done });
  }
  if (action === "empty-trash") {
    const msgs = await listMessages();
    let done = 0;
    for (const m of msgs) {
      if (m.folder === "trash") { try { await store.delete(m.id); done++; } catch {} }
    }
    return json(200, { ok: true, done });
  }
  // ===== Assinatura (rich text, guardada no Blobs — vale em qualquer dispositivo) =====
  if (action === "sig-get") {
    const sig = await store.get("signature", { type: "json" }).catch(() => null);
    return json(200, { ok: true, html: sig?.html || "" });
  }
  if (action === "sig-save") {
    await store.setJSON("signature", { html: sanitizeOutgoingHtml(body.html || "") });
    return json(200, { ok: true });
  }
  // ===== Rascunhos =====
  if (action === "draft-save") {
    const d = body.draft || {};
    const draftId = d.id && String(d.id).startsWith("draft-") ? d.id : "draft-" + crypto.randomUUID();
    await store.setJSON(draftId, {
      id: draftId, folder: "draft", read: true, favorite: false,
      to: String(d.to || "").slice(0, 500), subject: String(d.subject || "").slice(0, 200),
      html: sanitizeOutgoingHtml(d.html || ""), updatedAt: new Date().toISOString(),
    });
    return json(200, { ok: true, id: draftId });
  }
  if (action === "draft-delete") {
    await store.delete(id);
    return json(200, { ok: true });
  }
  // ===== Download de anexo (enviado ou recebido) =====
  if (action === "download") {
    const msg = await store.get(id, { type: "json" });
    if (!msg || !Array.isArray(msg.attachments)) return json(404, { ok: false, error: "Anexo não encontrado" });
    const att = msg.attachments[Number(body.index) || 0];
    if (!att || !att.content) return json(404, { ok: false, error: "Anexo não encontrado" });
    return json(200, { ok: true, filename: att.filename, content_type: att.content_type, content: att.content });
  }
  if (action === "reply") {
    if (!to || (!text && !html)) return json(400, { ok: false, error: "Destinatário e texto são obrigatórios" });
    const sigRec = await store.get("signature", { type: "json" }).catch(() => null);
    const signature = sigRec?.html || "";
    const orig = body.quoteId ? await store.get(body.quoteId, { type: "json" }).catch(() => null) : null;
    const finalHtml = buildHtml(html || `<p>${escHtml(text).replace(/\n/g, "<br/>")}</p>`, signature, orig ? quoteFromMsg(orig) : "");
    const atts = sanitizeAttachments(body.attachments);
    const payload = { from: "Salvio Goncalves <contato@salviogoncalves.com.br>", to: [to], subject: subject || "Re: sua mensagem", html: finalHtml, text: text || buildText(finalHtml) };
    if (atts.length) payload.attachments = atts;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return json(502, { ok: false, error: "Falha ao enviar a resposta" });
    const sentId = "sent-" + crypto.randomUUID();
    await store.setJSON(sentId, {
      id: sentId, folder: "sent", read: true, favorite: false,
      from: "Salvio Goncalves <contato@salviogoncalves.com.br>",
      to: to, subject: subject || "Re: sua mensagem", text: payload.text, html: finalHtml,
      attachments: atts.map(({ filename, content_type }) => ({ filename, content_type })),
      sentAt: new Date().toISOString(),
    });
    return json(200, { ok: true });
  }
  if (action === "send") {
    if (!to || (!text && !html)) return json(400, { ok: false, error: "Destinatário e mensagem são obrigatórios" });
    const emails = to.split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!emails.length) return json(400, { ok: false, error: "Nenhum e-mail de destino válido" });
    const sigRec = await store.get("signature", { type: "json" }).catch(() => null);
    const signature = sigRec?.html || "";
    const finalHtml = buildHtml(html || `<p>${escHtml(text).replace(/\n/g, "<br/>")}</p>`, signature);
    const atts = sanitizeAttachments(body.attachments);
    const payload = { from: "Salvio Goncalves <contato@salviogoncalves.com.br>", to: emails, subject: subject || "(sem assunto)", html: finalHtml, text: text || buildText(finalHtml) };
    if (atts.length) payload.attachments = atts;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return json(502, { ok: false, error: "Falha ao enviar o e-mail" });
    const sentId = "sent-" + crypto.randomUUID();
    await store.setJSON(sentId, {
      id: sentId, folder: "sent", read: true, favorite: false,
      from: "Salvio Goncalves <contato@salviogoncalves.com.br>",
      to: emails.join(", "), subject: subject || "(sem assunto)", text: payload.text, html: finalHtml,
      attachments: atts.map(({ filename, content_type }) => ({ filename, content_type })),
      sentAt: new Date().toISOString(),
    });
    return json(200, { ok: true });
  }
  return json(400, { ok: false, error: "Ação desconhecida" });
}

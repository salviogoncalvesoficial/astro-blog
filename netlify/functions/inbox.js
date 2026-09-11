import crypto from "node:crypto";
import { getStore, connectLambda } from "@netlify/blobs";

const TRASH_DAYS = 30;

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

export async function handler(event) {
  try { connectLambda(event); } catch {}
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método não permitido" };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { ok: false, error: "JSON inválido" }); }
  const { action, password, token, id, to, subject, text, value } = body;

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
    // Operações em massa: ids[] + op (trash | archive | read | unread | delete permanente)
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const op = ["trash", "archive", "read", "unread", "delete"].includes(body.op) ? body.op : null;
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
  if (action === "reply") {
    if (!to || !text) return json(400, { ok: false, error: "Destinatário e texto são obrigatórios" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Salvio Goncalves <contato@salviogoncalves.com.br>", to: [to], subject: subject || "Re: sua mensagem", text }),
    });
    if (!res.ok) return json(502, { ok: false, error: "Falha ao enviar a resposta" });
    return json(200, { ok: true });
  }
  if (action === "send") {
    if (!to || !text) return json(400, { ok: false, error: "Destinatário e mensagem são obrigatórios" });
    const emails = to.split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!emails.length) return json(400, { ok: false, error: "Nenhum e-mail de destino válido" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Salvio Goncalves <contato@salviogoncalves.com.br>", to: emails, subject: subject || "(sem assunto)", text }),
    });
    if (!res.ok) return json(502, { ok: false, error: "Falha ao enviar o e-mail" });
    const sentId = "sent-" + crypto.randomUUID();
    await store.setJSON(sentId, {
      id: sentId, folder: "sent", read: true, favorite: false,
      from: "Salvio Goncalves <contato@salviogoncalves.com.br>",
      to: emails.join(", "), subject: subject || "(sem assunto)", text,
      sentAt: new Date().toISOString(),
    });
    return json(200, { ok: true });
  }
  return json(400, { ok: false, error: "Ação desconhecida" });
}

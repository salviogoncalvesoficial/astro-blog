import { getStore, connectLambda } from "@netlify/blobs";
import { sendPushNotification } from "./push.js";

/** Webhook de recebimento do Resend (Inbound). */
export async function handler(event) {
  try {
    try { connectLambda(event); } catch {}
    const body = JSON.parse(event.body || "{}");
    const msg = body.data ?? body;
    const emailId = msg.email_id ?? msg.id;
    let text = "", html = "", from = msg.from ?? "desconhecido";
    if (emailId && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
        if (res.ok) {
          const full = await res.json();
          text = full.text ?? "";
          html = full.html ?? "";
          // O nome de exibição ("Nome <email>") vem no header From; o campo
          // from do topo e do webhook trazem só o endereço cru.
          from = full.headers?.from || full.from || from;
        }
      } catch (err) { console.error("[inbox] erro ao buscar conteúdo:", err?.message); }
    }
    // Anexos: o webhook só traz metadados — busca as URLs temporárias (valem 1h)
    // na Attachments API e guarda o conteúdo no Blobs para download posterior.
    let attachments = [];
    if (emailId && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        });
        if (res.ok) {
          const data = await res.json();
          const list = data.data || data || [];
          let total = 0;
          for (const a of list.slice(0, 10)) {
            if (!a.download_url) continue;
            const r2 = await fetch(a.download_url);
            if (!r2.ok) continue;
            const buf = Buffer.from(await r2.arrayBuffer());
            const b64 = buf.toString("base64");
            total += b64.length;
            if (total > 4.8 * 1024 * 1024) break;
            attachments.push({ filename: a.filename || "anexo", content_type: a.content_type || "application/octet-stream", content: b64 });
          }
        }
      } catch (err) { console.error("[inbox] erro ao buscar anexos:", err?.message); }
    }
    const store = getStore("inbox");
    const id = emailId || `mail-${Date.now()}`;
    await store.setJSON(id, { id, from, to: Array.isArray(msg.to) ? msg.to.join(", ") : msg.to ?? "", subject: msg.subject || "(sem assunto)", text, html, attachments, receivedAt: body.created_at ?? new Date().toISOString(), read: false });
    try {
      await sendPushNotification({ title: "Novo e-mail no Inbox", body: `${from ?? "Novo contato"}: ${msg.subject || "(sem assunto)"}`, url: `/admin/?inbox=${encodeURIComponent(id)}` });
    } catch (err) { console.error("[push] erro ao notificar:", err?.message); }
    return { statusCode: 200, body: "ok" };
  } catch (err) { console.error("[inbox] erro:", err?.message); return { statusCode: 200, body: "ok" }; }
}

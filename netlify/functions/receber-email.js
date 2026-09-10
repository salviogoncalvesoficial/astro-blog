import { getStore, connectLambda } from "@netlify/blobs";
import { sendPushNotification } from "./push.js";

/** Webhook de recebimento do Resend (Inbound). */
export async function handler(event) {
  try {
    try { connectLambda(event); } catch {}
    const body = JSON.parse(event.body || "{}");
    const msg = body.data ?? body;
    const emailId = msg.email_id ?? msg.id;
    let text = "", html = "";
    if (emailId && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
        if (res.ok) { const full = await res.json(); text = full.text ?? ""; html = full.html ?? ""; }
      } catch (err) { console.error("[inbox] erro ao buscar conteúdo:", err?.message); }
    }
    const store = getStore("inbox");
    const id = emailId || `mail-${Date.now()}`;
    await store.setJSON(id, { id, from: msg.from ?? "desconhecido", to: Array.isArray(msg.to) ? msg.to.join(", ") : msg.to ?? "", subject: msg.subject || "(sem assunto)", text, html, receivedAt: body.created_at ?? new Date().toISOString(), read: false });
    try {
      await sendPushNotification({ title: "Novo e-mail no Inbox", body: `${msg.from ?? "Novo contato"}: ${msg.subject || "(sem assunto)"}`, url: `/admin/?inbox=${encodeURIComponent(id)}` });
    } catch (err) { console.error("[push] erro ao notificar:", err?.message); }
    return { statusCode: 200, body: "ok" };
  } catch (err) { console.error("[inbox] erro:", err?.message); return { statusCode: 200, body: "ok" }; }
}

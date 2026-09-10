import { getStore, connectLambda } from "@netlify/blobs";

/**
 * Webhook de recebimento do Resend (Inbound).
 * O webhook traz só os metadados (from/to/subject) — o corpo (text/html)
 * vem da API "Received emails": GET /emails/receiving/:id
 */
export async function handler(event) {
  try {
    try { connectLambda(event); } catch {}

    const body = JSON.parse(event.body || "{}");
    const msg = body.data ?? body;
    const emailId = msg.email_id ?? msg.id;

    // 1. Busca o conteúdo completo na API do Resend
    let text = "";
    let html = "";
    if (emailId && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        });
        if (res.ok) {
          const full = await res.json();
          text = full.text ?? "";
          html = full.html ?? "";
        } else {
          console.error("[inbox] falha ao buscar conteúdo:", res.status);
        }
      } catch (err) {
        console.error("[inbox] erro ao buscar conteúdo:", err?.message);
      }
    }

    // 2. Salva na caixa de entrada
    const store = getStore("inbox");
    const id = emailId || `mail-${Date.now()}`;

    await store.setJSON(id, {
      id,
      from: msg.from ?? "desconhecido",
      to: Array.isArray(msg.to) ? msg.to.join(", ") : msg.to ?? "",
      subject: msg.subject || "(sem assunto)",
      text,
      html,
      receivedAt: body.created_at ?? new Date().toISOString(),
      read: false,
    });

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("[inbox] erro:", err?.message);
    return { statusCode: 200, body: "ok" }; // webhook: sempre 200 para o Resend não reenviar
  }
}
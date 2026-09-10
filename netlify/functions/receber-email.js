import { getStore, connectLambda } from "@netlify/blobs";

/**
 * Webhook de recebimento do Resend (Inbound).
 * Cada e-mail enviado para @salviogoncalves.com.br chega aqui
 * e é salvo na caixa de entrada do /admin.
 *
 * Formato do payload do Resend (Inbound):
 * { type: "email.received", created_at, data: {
 *     id, object: "message", from, to: [], subject, text, html, headers: {...} } }
 */
export async function handler(event) {
  try {
    try { connectLambda(event); } catch {}

    const body = JSON.parse(event.body || "{}");
    // o conteúdo vem dentro de "data"; se não vier, usa o body direto (compatibilidade)
    const msg = body.data ?? body;

    const store = getStore("inbox");
    const id = msg.id || body.id || `mail-${Date.now()}`;

    // "from" pode vir como "Nome <email@x>" ou só o e-mail
    const from = msg.from ?? "desconhecido";

    await store.setJSON(id, {
      id,
      from,
      to: Array.isArray(msg.to) ? msg.to.join(", ") : msg.to ?? "",
      subject: msg.subject || "(sem assunto)",
      text: msg.text ?? "",
      html: msg.html ?? "",
      receivedAt: body.created_at ?? new Date().toISOString(),
      read: false,
    });

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("[inbox] erro:", err?.message);
    return { statusCode: 200, body: "ok" }; // webhook: sempre 200 para o Resend não reenviar
  }
}
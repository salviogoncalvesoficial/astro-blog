import { getStore, connectLambda } from "@netlify/blobs";

/**
 * Webhook de recebimento do Resend (Inbound).
 * Cada e-mail enviado para @salviogoncalves.com.br chega aqui
 * e é salvo na caixa de entrada do /admin.
 */
export async function handler(event) {
  try {
    try { connectLambda(event); } catch {}

    const body = JSON.parse(event.body || "{}");
    const msg = body;

    const store = getStore("inbox");
    const id = body.id || `mail-${Date.now()}`;

    await store.setJSON(id, {
      id,
      from: msg.from ?? "desconhecido",
      to: msg.to ?? "",
      subject: msg.subject ?? "(sem assunto)",
      text: msg.text ?? "",
      html: msg.html ?? "",
      receivedAt: new Date().toISOString(),
      read: false,
    });

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("[inbox] erro:", err?.message);
    return { statusCode: 200, body: "ok" }; // webhook: sempre 200 para o Resend não reenviar
  }
}

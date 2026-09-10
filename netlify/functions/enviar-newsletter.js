import { sendWeeklyNewsletter, initBlobs } from "./lib/newsletter.js";

/**
 * Enviado automaticamente toda segunda-feira às 9h (UTC → 6h de Brasília)
 */
export const config = {
  schedule: "0 9 * * 1",
};

export async function handler(event) {
  initBlobs(event);
  try {
    const result = await sendWeeklyNewsletter();
    return { statusCode: 200, body: result.message };
  } catch (err) {
    return { statusCode: 500, body: `Erro no envio: ${err.message}` };
  }
}

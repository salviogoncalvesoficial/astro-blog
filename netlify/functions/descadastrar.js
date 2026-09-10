import { unsubscribe, emailFromToken, emailTemplate, sendEmail } from "./lib/newsletter.js";

/**
 * GET /descadastrar?token=...  → confirma o descadastro e mostra a página
 */
export async function handler(event) {
  const params = new URLSearchParams(event.queryStringParameters || {});
  const token = params.get("token");
  const email = token ? emailFromToken(token) : null;

  let ok = false;
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const result = await unsubscribe(email);
    ok = result.ok;
  }

  const html = emailTemplate({
    title: ok ? "Sua inscrição foi cancelada" : "Link inválido",
    bodyHtml: ok
      ? `
        <p>Pronto — você não receberá mais e-mails desta newsletter.</p>
        <p>Se mudar de ideia, a porta continua aberta: é só se inscrever novamente no blog quando quiser voltar.</p>
        <p style="text-align:center;margin:24px 0;">
          <a href="https://salviogoncalves.com.br" style="display:inline-block;background:#4e6351;color:#faf7f2;padding:12px 28px;border-radius:9999px;text-decoration:none;font-size:14px;">Voltar ao blog</a>
        </p>
        <p>Com acolhimento,<br/><strong>Salvio Gonçalves</strong></p>
      `
      : `
        <p>Este link de descadastro não é válido ou já expirou.</p>
        <p>Se você continua recebendo e-mails e quer sair da lista, me escreva respondendo qualquer e-mail recebido — eu faço o cancelamento manualmente.</p>
      `,
    footerNote: "Este é um e-mail automático — não é preciso responder.",
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: html,
  };
}

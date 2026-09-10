import { subscribe, sendEmail, emailTemplate, SITE_URL, initBlobs } from "./lib/newsletter.js";

/**
 * POST /inscrever (via formulário do blog)
 * Body: email=...
 */
export async function handler(event) {
  initBlobs(event);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método não permitido" };
  }
  const params = new URLSearchParams(event.body || "");
  const rawEmail = params.get("email") || "";
  // Teclados mobile inserem espaços e caracteres invisíveis (copiar/colar) —
  // remove tudo que não pertence a um e-mail antes de validar
  const email = rawEmail
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, "")
    .toLowerCase();
  const honeypot = params.get("website"); // campo anti-spam escondido

  // Validação básica de e-mail
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.log("[newsletter] e-mail rejeitado na validação:", JSON.stringify(rawEmail));
    // devolve o texto recebido para o usuário ver o que chegou
    return redirect(`/?newsletter=erro&email=${encodeURIComponent(email || rawEmail.trim())}#newsletter`);
  }
  // Bots que preenchem o campo escondido são ignorados
  if (honeypot) return redirect("/?newsletter=ok#newsletter");

  const result = await subscribe(email);

  // E-mail de boas-vindas (não bloqueia a inscrição se falhar;
  // não reenvia para quem já é inscrito)
  if (result.ok && !result.already) {
    try {
      const ok = await sendEmail({
        to: email,
        subject: "Bem-vindo ao espaço de reflexão de Salvio Gonçalves",
        html: emailTemplate({
          title: "Que bom que você chegou",
          bodyHtml: `
            <p>Olá,</p>
            <p>Recebi sua inscrição na newsletter do blog <strong>salviogoncalves.com.br</strong> — um espaço para pensar, sentir e se cuidar.</p>
            <p>De agora em diante, sempre que eu publicar um texto novo sobre ansiedade, autoconhecimento e saúde emocional, você recebe direto no seu e-mail.</p>
            <p style="text-align:center;margin:24px 0;">
              <a href="${SITE_URL}" style="display:inline-block;background:#4e6351;color:#faf7f2;padding:12px 28px;border-radius:9999px;text-decoration:none;font-size:14px;">Conheça o blog</a>
            </p>
            <p>Com acolhimento,<br/><strong>Salvio Gonçalves</strong></p>
          `,
          footerNote: "Você recebeu este e-mail porque se inscreveu na newsletter do blog.",
        }),
      });
      console.log(`[newsletter] boas-vindas para ${email}: ${ok ? "enviado" : "FALHOU"}`);
    } catch (err) {
      console.error("[newsletter] erro no envio das boas-vindas:", err?.message);
    }
  }

  return redirect("/?newsletter=ok#newsletter");
}

function redirect(to) {
  return {
    statusCode: 303,
    headers: { Location: to },
    body: "",
  };
}

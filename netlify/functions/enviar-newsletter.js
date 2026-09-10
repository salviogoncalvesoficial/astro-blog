import { getActiveSubscribers, sendEmail, emailTemplate, SITE_URL } from "./lib/newsletter.js";

/**
 * Enviado automaticamente toda segunda-feira às 9h (horário do servidor UTC → 6h de Brasília)
 * Lê o RSS do blog, monta o e-mail com os posts novos e envia para os ativos.
 * Também pode ser disparado manualmente pelo dashboard (/admin, Etapa 2).
 */
export const config = {
  schedule: "0 9 * * 1",
};

export async function handler() {
  try {
    // 1. Lê o RSS do blog
    const rss = await fetch(`${SITE_URL}/rss.xml`).then((r) => r.text());

    // 2. Extrai os posts publicados nos últimos 7 dias
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(rss)) !== null) {
      const block = match[1];
      const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
      const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
      const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
      const ts = pubDate ? new Date(pubDate).getTime() : 0;
      if (ts >= weekAgo) items.push({ title: decodeXml(title), link });
    }

    if (items.length === 0) {
      return { statusCode: 200, body: "Nenhum post novo na última semana — nada a enviar." };
    }

    // 3. Monta o corpo do e-mail
    const listHtml = items
      .map(
        (item) => `
        <div style="margin:0 0 20px 0;padding:16px;background:#f1ebe2;border-radius:12px;">
          <a href="${item.link}" style="color:#2c2723;font-weight:600;text-decoration:none;font-size:16px;">${item.title}</a><br/>
          <a href="${item.link}" style="color:#4e6351;font-size:13px;text-decoration:underline;">Ler o artigo →</a>
        </div>`
      )
      .join("");

    const plural = items.length > 1 ? "s" : "";
    const html = emailTemplate({
      title: `${items.length} novo${plural} artigo${plural} no blog`,
      bodyHtml: `
        <p>Olá,</p>
        <p>Passando para compartilhar o que publiquei nesta semana:</p>
        ${listHtml}
        <p>Uma boa leitura — e até a próxima reflexão.</p>
        <p>Com acolhimento,<br/><strong>Salvio Gonçalves</strong></p>
      `,
      footerNote: "Você recebe este e-mail porque se inscreveu na newsletter do blog.",
    });

    // 4. Envia para todos os ativos (Resend: 100/dia no plano grátis —
    //    acima disso, o envio continua no dia seguinte via nova execução)
    const subscribers = await getActiveSubscribers();
    let sent = 0;
    for (const sub of subscribers) {
      if (sent >= 90) break; // margem de segurança no teto diário do plano grátis
      const ok = await sendEmail({ to: sub.email, subject: `Novo${plural} artigo${plural} de Salvio Gonçalves`, html });
      if (ok) sent++;
    }

    return { statusCode: 200, body: `Enviado para ${sent} de ${subscribers.length} inscritos (${items.length} post${plural}).` };
  } catch (err) {
    return { statusCode: 500, body: `Erro no envio: ${err.message}` };
  }
}

function decodeXml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

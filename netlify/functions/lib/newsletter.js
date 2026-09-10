/**
 * Newsletter — biblioteca compartilhada
 * Lista de inscritos: Netlify Blobs (privado, fora do repo público)
 * Envio: Resend (API)
 */
import { getStore } from "@netlify/blobs";

export const FROM_EMAIL = "Newsletter Salvio Goncalves <news@salviogoncalves.com.br>";
export const SITE_URL = "https://salviogoncalves.com.br";

export function getSubscribersStore() {
  return getStore("newsletter");
}

/** Token simples para link de descadastro (não expõe o e-mail na URL) */
export function makeToken(email) {
  return Buffer.from(email).toString("base64url");
}

export function emailFromToken(token) {
  try {
    return Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/** Lista de e-mails ativos (para o envio semanal) */
export async function getActiveSubscribers() {
  const store = getSubscribersStore();
  const { blobs } = await store.list();
  const active = [];
  for (const blob of blobs) {
    const data = await store.get(blob.key, { type: "json" });
    if (data && data.status === "active") active.push(data);
  }
  return active;
}

/** Inscreve ou reativa um e-mail. Retorna {ok, already, reactivated} */
export async function subscribe(email) {
  const store = getSubscribersStore();
  const key = email.toLowerCase().trim();
  const existing = await store.get(key, { type: "json" }).catch(() => null);
  if (existing) {
    if (existing.status === "active") return { ok: true, already: true };
    await store.setJSON(key, { ...existing, status: "active", reactivatedAt: new Date().toISOString() });
    return { ok: true, reactivated: true };
  }
  await store.setJSON(key, {
    email: key,
    status: "active",
    subscribedAt: new Date().toISOString(),
  });
  return { ok: true };
}

/** Marca como cancelado (descadastro) */
export async function unsubscribe(email) {
  const store = getSubscribersStore();
  const key = email.toLowerCase().trim();
  const existing = await store.get(key, { type: "json" }).catch(() => null);
  if (!existing) return { ok: false };
  await store.setJSON(key, { ...existing, status: "unsubscribed", unsubscribedAt: new Date().toISOString() });
  return { ok: true };
}

/** Envia e-mail via Resend */
export async function sendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });
  return res.ok;
}

/** Template base — identidade "Acolhimento Sóbrio" do blog */
export function emailTemplate({ title, bodyHtml, footerNote }) {
  return `<!doctype html>
<html lang="pt-br">
<body style="margin:0;padding:0;background:#f1ebe2;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1ebe2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#faf7f2;border-radius:16px;border:1px solid #e2dacd;overflow:hidden;">
        <tr><td style="padding:32px 40px 8px 40px;text-align:center;">
          <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#4e6351;font-weight:600;">Salvio Gonçalves · Terapeuta</p>
        </td></tr>
        <tr><td style="padding:8px 40px 0 40px;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#2c2723;text-align:center;">${title}</h1>
        </td></tr>
        <tr><td style="padding:16px 40px 8px 40px;">
          <div style="font-size:15px;line-height:1.7;color:#2c2723;">${bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:16px 40px 32px 40px;border-top:1px solid #e2dacd;margin-top:16px;">
          <p style="margin:0 0 8px 0;font-size:12px;color:#6e655c;text-align:center;">${footerNote ?? ""}</p>
          <p style="margin:0;font-size:12px;color:#6e655c;text-align:center;">
            <a href="${SITE_URL}" style="color:#4e6351;">salviogoncalves.com.br</a>
            &nbsp;·&nbsp;
            <a href="${SITE_URL}/descadastrar" style="color:#6e655c;">Cancelar inscrição</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

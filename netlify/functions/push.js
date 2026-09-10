import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const store = () => getStore("push-subscriptions");
function configured() { return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT); }
function setup() { if (configured()) webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY); }
export async function sendPushNotification(payload) {
  if (!configured()) return { sent: 0, skipped: true };
  setup(); const s = store(); const { blobs } = await s.list(); let sent = 0;
  for (const b of blobs) {
    const sub = await s.get(b.key, { type: "json" }); if (!sub) continue;
    try { await webpush.sendNotification(sub, JSON.stringify(payload)); sent++; }
    catch (err) { if ([404, 410].includes(err.statusCode)) await s.delete(b.key); else console.error("[push] falha:", err.message); }
  }
  return { sent };
}
export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método não permitido" };
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { ok: false, error: "JSON inválido" }); }
  const { action, token, subscription } = body;
  if (action === "public-key") return configured() ? json(200, { ok: true, publicKey: process.env.VAPID_PUBLIC_KEY }) : json(503, { ok: false, error: "Push ainda não configurado na Netlify" });
  const secret = process.env.ADMIN_PASSWORD || "";
  const expected = require("node:crypto").createHmac("sha256", secret).update("nl-admin-v1").digest("base64url");
  if (!token || token !== expected) return json(401, { ok: false, error: "Sessão expirada — entre novamente" });
  if (!configured()) return json(503, { ok: false, error: "Configure as chaves VAPID na Netlify" });
  const s = store();
  if (action === "subscribe") {
    if (!subscription?.endpoint) return json(400, { ok: false, error: "Inscrição inválida" });
    const key = Buffer.from(subscription.endpoint).toString("base64url"); await s.setJSON(key, subscription);
    return json(200, { ok: true });
  }
  if (action === "unsubscribe") { if (subscription?.endpoint) await s.delete(Buffer.from(subscription.endpoint).toString("base64url")); return json(200, { ok: true }); }
  if (action === "test") { const result = await sendPushNotification({ title: "Inbox do Salvio", body: "Notificação de teste funcionando!", url: "/admin/" }); return json(200, { ok: true, ...result }); }
  return json(400, { ok: false, error: "Ação desconhecida" });
}

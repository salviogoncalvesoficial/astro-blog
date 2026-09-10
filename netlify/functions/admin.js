import crypto from "node:crypto";
import {
  getAllSubscribers,
  subscribe,
  removeSubscriber,
  sendWeeklyNewsletter,
  initBlobs,
} from "./lib/newsletter.js";

/**
 * API do dashboard /admin (Etapa 2)
 * POST {action: login|list|add|delete|send|emails, ...}
 * GET  ?token=...&export=1 → CSV da lista
 * Autenticação: senha em ADMIN_PASSWORD (env) → token HMAC validado a cada chamada
 */

function makeToken() {
  const secret = process.env.ADMIN_PASSWORD || "";
  return crypto.createHmac("sha256", secret).update("nl-admin-v1").digest("base64url");
}

function checkToken(token) {
  if (!token) return false;
  const expected = makeToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handler(event) {
  initBlobs(event);

  // ===== Exportação CSV (GET) =====
  if (event.httpMethod === "GET") {
    const params = new URLSearchParams(event.queryStringParameters || {});
    if (!checkToken(params.get("token"))) {
      return { statusCode: 401, body: "Não autorizado" };
    }
    const subs = await getAllSubscribers();
    const rows = [
      ["email", "status", "inscrito_em", "cancelado_em"],
      ...subs.map((s) => [s.email, s.status, s.subscribedAt ?? "", s.unsubscribedAt ?? ""]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="newsletter-inscritos-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
      body: csv,
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método não permitido" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "JSON inválido" };
  }
  const { action, password, token, email } = body;

  // ===== Login =====
  if (action === "login") {
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return json(401, { ok: false, error: "Senha incorreta" });
    }
    return json(200, { ok: true, token: makeToken() });
  }

  // ===== Todas as outras ações exigem token válido =====
  if (!checkToken(token)) {
    return json(401, { ok: false, error: "Sessão expirada — entre novamente" });
  }

  if (action === "list") {
    const subs = await getAllSubscribers();
    const active = subs.filter((s) => s.status === "active").length;
    const unsubscribed = subs.filter((s) => s.status === "unsubscribed").length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = subs.filter((s) => s.subscribedAt && new Date(s.subscribedAt).getTime() >= weekAgo).length;
    return json(200, { ok: true, subs, stats: { total: subs.length, active, unsubscribed, newThisWeek } });
  }

  if (action === "add") {
    const clean = (email || "").replace(/[\s\u200B-\u200D\uFEFF]+/g, "").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return json(400, { ok: false, error: "E-mail inválido" });
    }
    await subscribe(clean);
    return json(200, { ok: true });
  }

  if (action === "delete") {
    await removeSubscriber(email);
    return json(200, { ok: true });
  }

  if (action === "send") {
    const result = await sendWeeklyNewsletter();
    return json(200, { ok: true, ...result });
  }

  if (action === "emails") {
    // últimos envios, direto do Resend
    const res = await fetch("https://api.resend.com/emails?limit=25", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) return json(502, { ok: false, error: "Falha ao consultar o Resend" });
    const data = await res.json();
    const emails = (data.data || []).map((e) => ({
      to: (e.to || [])[0],
      subject: e.subject,
      created_at: e.created_at,
      last_event: e.last_event,
    }));
    return json(200, { ok: true, emails });
  }

  return json(400, { ok: false, error: "Ação desconhecida" });
}

function json(code, obj) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

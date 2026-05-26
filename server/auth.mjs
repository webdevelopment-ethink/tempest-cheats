import crypto from "node:crypto";

const SESSION_COOKIE = "tempest_admin_session";
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

export function adminPasswordConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD?.length);
}

export function createSessionToken() {
  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token || !sessionSecret()) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Date.now() < exp;
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;

  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || "";
}

export function isAuthenticated(req) {
  return verifySessionToken(getSessionFromRequest(req));
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}${secure}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
}

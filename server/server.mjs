import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import {
  createDbClient,
  isDbConfigured,
  reserveKeyForOrder,
  assertProductId,
  importKeys,
  getStockCounts,
  getPublicStock,
  getAnalytics,
  lookupByEmail,
  lookupBySession,
  PRODUCT_IDS,
} from "./db.mjs";
import {
  adminPasswordConfigured,
  createSessionToken,
  verifyAdminPassword,
  isAuthenticated,
  setSessionCookie,
  clearSessionCookie,
} from "./auth.mjs";
import { sendKeyEmail } from "./email.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_DIR = path.join(__dirname, "admin", "public");

const {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  PORT = "8787",
  HOST = "0.0.0.0",
  ADMIN_ENABLED = "false",
  ALLOWED_ORIGINS = "",
} = process.env;

const adminEnabled = String(ADMIN_ENABLED).toLowerCase() === "true";

const dbConfigured = isDbConfigured();
const db = dbConfigured ? createDbClient() : null;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const allowedOrigins = new Set(
  ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
// Sensible defaults if the env var isn't set.
if (!allowedOrigins.size) {
  allowedOrigins.add("https://projectempest.xyz");
  allowedOrigins.add("https://www.projectempest.xyz");
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://localhost:5174");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return null;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}

function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function serveStatic(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  res.end(fs.readFileSync(filePath));
}

function requireDb(res) {
  if (!db) {
    json(res, 503, {
      ok: false,
      error: "db_not_configured",
      message: "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and KEY_ENCRYPTION_SECRET.",
    });
    return false;
  }
  return true;
}

function requireAuth(req, res) {
  if (!adminPasswordConfigured()) {
    json(res, 503, { error: "admin_not_configured", message: "Set ADMIN_PASSWORD on the server." });
    return false;
  }
  if (!isAuthenticated(req)) {
    json(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

async function handleStripeWebhook(req, res) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    json(res, 503, { ok: false, error: "stripe_not_configured" });
    return;
  }
  if (!requireDb(res)) return;

  const body = await readBody(req);
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    json(res, 400, { ok: false, error: "missing_signature" });
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    json(res, 400, { ok: false, error: "invalid_signature" });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_details?.email || session.customer_email;
      const productId = session.client_reference_id;
      const stripeSessionId = session.id;

      if (!email) {
        console.warn("checkout.session.completed without email", stripeSessionId);
      } else if (!productId) {
        console.error("missing client_reference_id", stripeSessionId);
        json(res, 400, { ok: false, error: "missing_product_id" });
        return;
      } else {
        try {
          assertProductId(productId);
        } catch (err) {
          console.error(err.message, stripeSessionId);
          json(res, 400, { ok: false, error: "invalid_product_id" });
          return;
        }

        const result = await reserveKeyForOrder(db, { productId, email, stripeSessionId });

        if (!result.alreadyDelivered) {
          await sendKeyEmail({
            email: result.email,
            productId: result.productId,
            keyCode: result.keyCode,
          });
          console.log(`Key delivered: ${productId} -> ${email}`);
        } else {
          console.log(`Duplicate webhook: ${stripeSessionId}`);
        }
      }
    }

    json(res, 200, { ok: true });
  } catch (err) {
    if (err.code === "OUT_OF_STOCK") {
      console.error("OUT OF STOCK:", err.message);
      json(res, 503, { ok: false, error: "out_of_stock" });
      return;
    }
    console.error("webhook failed:", err);
    json(res, 500, { ok: false, error: "processing_failed" });
  }
}

async function handleAdminApi(req, res, pathname) {
  if (pathname === "/admin/api/login" && req.method === "POST") {
    const body = await readJson(req);
    if (body === null) return json(res, 400, { error: "invalid_json" });

    if (!adminPasswordConfigured()) {
      return json(res, 503, { error: "admin_not_configured" });
    }

    if (!verifyAdminPassword(body.password || "")) {
      return json(res, 401, { error: "invalid_password" });
    }

    setSessionCookie(res, createSessionToken());
    return json(res, 200, { ok: true });
  }

  if (pathname === "/admin/api/logout" && req.method === "POST") {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/admin/api/me" && req.method === "GET") {
    return json(res, 200, {
      authenticated: isAuthenticated(req),
      adminConfigured: adminPasswordConfigured(),
    });
  }

  if (!requireAuth(req, res)) return;
  if (!requireDb(res)) return;

  if (pathname === "/admin/api/analytics" && req.method === "GET") {
    return json(res, 200, await getAnalytics(db));
  }

  if (pathname === "/admin/api/stock" && req.method === "GET") {
    return json(res, 200, { stock: await getStockCounts(db), products: PRODUCT_IDS });
  }

  if (pathname === "/admin/api/import" && req.method === "POST") {
    const body = await readJson(req);
    if (body === null) return json(res, 400, { error: "invalid_json" });

    try {
      assertProductId(body.productId);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    const text = body.keys || "";
    const lines = Array.isArray(body.keysList) ? body.keysList : text.split(/\r?\n/);
    const result = await importKeys(db, body.productId, lines);
    return json(res, 200, { ok: true, ...result, stock: await getStockCounts(db) });
  }

  if (pathname === "/admin/api/lookup" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const email = url.searchParams.get("email");
    const session = url.searchParams.get("session");

    if (email) {
      return json(res, 200, { results: await lookupByEmail(db, email) });
    }
    if (session) {
      const row = await lookupBySession(db, session);
      return json(res, 200, { results: row ? [row] : [] });
    }
    return json(res, 400, { error: "provide email or session query param" });
  }

  json(res, 404, { error: "not_found" });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const { pathname } = url;

  if (pathname === "/health") {
    return json(res, 200, {
      ok: true,
      db: dbConfigured ? "supabase" : "unconfigured",
      admin: adminEnabled && adminPasswordConfigured(),
      adminEnabled,
      stripe: Boolean(stripe && STRIPE_WEBHOOK_SECRET),
      email: Boolean(process.env.RESEND_API_KEY && process.env.KEY_EMAIL_FROM),
    });
  }

  // Public stock endpoint — used by the Vercel frontend to show live counts.
  if (pathname === "/api/stock") {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== "GET") {
      return json(res, 405, { error: "method_not_allowed" });
    }
    if (!requireDb(res)) return;
    try {
      const stock = await getPublicStock(db);
      res.setHeader("Cache-Control", "public, max-age=15");
      return json(res, 200, { ok: true, stock });
    } catch (err) {
      console.error("/api/stock failed:", err);
      return json(res, 500, { ok: false, error: "stock_lookup_failed" });
    }
  }

  if (pathname === "/webhooks/stripe" && req.method === "POST") {
    return handleStripeWebhook(req, res);
  }

  if (pathname === "/admin" || pathname === "/admin/" || pathname.startsWith("/admin/")) {
    if (!adminEnabled) {
      return json(res, 404, { error: "not_found" });
    }

    if (pathname.startsWith("/admin/api/")) {
      return handleAdminApi(req, res, pathname);
    }

    if (pathname === "/admin" || pathname === "/admin/") {
      return serveStatic(res, path.join(ADMIN_DIR, "index.html"));
    }

    const rel = pathname.slice("/admin/".length);
    const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.join(ADMIN_DIR, safe);
    if (!filePath.startsWith(ADMIN_DIR)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    return serveStatic(res, filePath);
  }

  if (pathname === "/") {
    if (adminEnabled) return redirect(res, "/admin");
    return json(res, 404, { error: "not_found" });
  }

  json(res, 404, { error: "not_found" });
});

server.listen(Number(PORT), HOST, () => {
  console.log(`Tempest key server listening on http://${HOST}:${PORT}`);
  console.log(`  Admin:    ${adminEnabled ? "/admin (ENABLED)" : "DISABLED (set ADMIN_ENABLED=true to enable)"}`);
  console.log(`  Webhook:  POST /webhooks/stripe`);
  console.log(`  Stock:    GET  /api/stock`);
  console.log(`  Database: ${dbConfigured ? "Supabase" : "NOT CONFIGURED (set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KEY_ENCRYPTION_SECRET)"}`);
  if (adminEnabled && !adminPasswordConfigured()) {
    console.warn("  WARNING: ADMIN_PASSWORD not set — admin login disabled.");
  }
  if (!stripe) console.warn("  WARNING: Stripe not configured.");
});

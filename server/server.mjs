import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import {
  openDatabase,
  reserveKeyForOrder,
  assertProductId,
  importKeys,
  getStockCounts,
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
  KEY_DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/keys.db`
    : "./data/keys.db",
  PORT = "8787",
  HOST = "0.0.0.0",
} = process.env;

const db = openDatabase(KEY_DB_PATH);
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

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

        const result = reserveKeyForOrder(db, { productId, email, stripeSessionId });

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

  if (pathname === "/admin/api/analytics" && req.method === "GET") {
    return json(res, 200, getAnalytics(db));
  }

  if (pathname === "/admin/api/stock" && req.method === "GET") {
    return json(res, 200, { stock: getStockCounts(db), products: PRODUCT_IDS });
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
    const result = importKeys(db, body.productId, lines);
    return json(res, 200, { ok: true, ...result, stock: getStockCounts(db) });
  }

  if (pathname === "/admin/api/lookup" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const email = url.searchParams.get("email");
    const session = url.searchParams.get("session");

    if (email) {
      return json(res, 200, { results: lookupByEmail(db, email) });
    }
    if (session) {
      const row = lookupBySession(db, session);
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
      db: KEY_DB_PATH,
      admin: adminPasswordConfigured(),
      stripe: Boolean(stripe && STRIPE_WEBHOOK_SECRET),
      email: Boolean(process.env.RESEND_API_KEY && process.env.KEY_EMAIL_FROM),
    });
  }

  if (pathname === "/webhooks/stripe" && req.method === "POST") {
    return handleStripeWebhook(req, res);
  }

  if (pathname.startsWith("/admin/api/")) {
    return handleAdminApi(req, res, pathname);
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    return serveStatic(res, path.join(ADMIN_DIR, "index.html"));
  }

  if (pathname.startsWith("/admin/")) {
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
    return redirect(res, "/admin");
  }

  json(res, 404, { error: "not_found" });
});

server.listen(Number(PORT), HOST, () => {
  console.log(`Tempest key server listening on http://${HOST}:${PORT}`);
  console.log(`  Admin:    /admin`);
  console.log(`  Webhook:  POST /webhooks/stripe`);
  console.log(`  Database: ${KEY_DB_PATH}`);
  if (!adminPasswordConfigured()) {
    console.warn("  WARNING: ADMIN_PASSWORD not set — admin login disabled.");
  }
  if (!stripe) console.warn("  WARNING: Stripe not configured.");
});

import { createServer } from "node:http";
import Stripe from "stripe";
import {
  createDbClient,
  isDbConfigured,
  reserveKeyForOrder,
  assertProductId,
  getPublicStock,
} from "./db.mjs";
import { sendKeyEmail } from "./email.mjs";

const {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  PORT = "8787",
  HOST = "0.0.0.0",
  ALLOWED_ORIGINS = "",
} = process.env;

const dbConfigured = isDbConfigured();
const db = dbConfigured ? createDbClient() : null;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const allowedOrigins = new Set(
  ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
if (!allowedOrigins.size) {
  allowedOrigins.add("https://projectempest.xyz");
  allowedOrigins.add("https://www.projectempest.xyz");
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://localhost:5174");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const { pathname } = url;

  if (pathname === "/health") {
    return json(res, 200, {
      ok: true,
      db: dbConfigured ? "supabase" : "unconfigured",
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
      const detail = {
        message: err?.message || String(err),
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      };
      console.error("/api/stock failed:", JSON.stringify(detail));
      return json(res, 500, { ok: false, error: "stock_lookup_failed", detail });
    }
  }

  if (pathname === "/webhooks/stripe" && req.method === "POST") {
    return handleStripeWebhook(req, res);
  }

  json(res, 404, { error: "not_found" });
});

server.listen(Number(PORT), HOST, () => {
  console.log(`Tempest key server listening on http://${HOST}:${PORT}`);
  console.log(`  Webhook:  POST /webhooks/stripe`);
  console.log(`  Stock:    GET  /api/stock`);
  console.log(`  Database: ${dbConfigured ? "Supabase" : "NOT CONFIGURED (set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KEY_ENCRYPTION_SECRET)"}`);
  if (!stripe) console.warn("  WARNING: Stripe not configured.");
});

import { createClient } from "@supabase/supabase-js";
import { encryptKey, decryptKey, fingerprintKey, isCryptoConfigured } from "./crypto.mjs";

const VALID_PRODUCTS = new Set(["arc-1-day", "arc-7-day", "arc-30-day"]);
export const PRODUCT_IDS = ["arc-1-day", "arc-7-day", "arc-30-day"];

export function assertProductId(productId) {
  if (!VALID_PRODUCTS.has(productId)) {
    throw new Error(
      `Unknown product_id "${productId}". Expected one of: ${[...VALID_PRODUCTS].join(", ")}`
    );
  }
}

export function productDisplayName(productId) {
  const names = {
    "arc-1-day": "Arc Raiders 1 Day",
    "arc-7-day": "Arc Raiders 7 Days",
    "arc-30-day": "Arc Raiders 30 Days",
  };
  return names[productId] || productId;
}

/**
 * Build a Supabase client.  Uses the service-role key so the server can read
 * and write the keys/deliveries tables (which are otherwise locked down by
 * RLS).  Throws clearly if env vars are missing.
 */
export function createDbClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  if (!isCryptoConfigured()) {
    throw new Error(
      "KEY_ENCRYPTION_SECRET is missing or too short (must be at least 32 chars)"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isDbConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      isCryptoConfigured()
  );
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

/**
 * Encrypt and insert keys.  Duplicate keys (same plaintext) are silently
 * skipped — we detect them via the deterministic HMAC fingerprint.
 */
export async function importKeys(db, productId, keyCodes) {
  assertProductId(productId);

  const cleaned = [];
  for (const raw of keyCodes) {
    const keyCode = String(raw || "").trim();
    if (!keyCode || keyCode.startsWith("#")) continue;
    cleaned.push(keyCode);
  }

  if (!cleaned.length) {
    return { added: 0, skipped: 0 };
  }

  // Pre-encrypt and fingerprint everything outside the DB round-trip.
  const rows = cleaned.map((plaintext) => ({
    product_id: productId,
    key_code_encrypted: encryptKey(plaintext),
    key_fingerprint: fingerprintKey(plaintext),
    status: "available",
  }));

  // upsert with ignoreDuplicates so re-importing the same key is a no-op.
  const { data, error } = await db
    .from("keys")
    .upsert(rows, {
      onConflict: "key_fingerprint",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) throw error;

  const added = data?.length ?? 0;
  const skipped = rows.length - added;
  return { added, skipped };
}

// ---------------------------------------------------------------------------
// Reserve a key for an order (called from the Stripe webhook)
// ---------------------------------------------------------------------------

export async function reserveKeyForOrder(db, { productId, email, stripeSessionId }) {
  assertProductId(productId);

  const { data, error } = await db.rpc("reserve_key", {
    p_product_id: productId,
    p_email: email,
    p_stripe_session_id: stripeSessionId,
  });

  if (error) {
    if (error.message?.includes("OUT_OF_STOCK") || error.code === "P0001") {
      const err = new Error(`No keys in stock for ${productId}`);
      err.code = "OUT_OF_STOCK";
      throw err;
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("reserve_key returned no row");
  }

  const keyCode = decryptKey(row.key_code_encrypted);

  return {
    alreadyDelivered: Boolean(row.already_delivered),
    keyCode,
    productId,
    email,
  };
}

// ---------------------------------------------------------------------------
// Stock counts (used by /api/stock and the admin UI)
// ---------------------------------------------------------------------------

export async function getStockCounts(db) {
  const { data, error } = await db
    .from("keys")
    .select("product_id, status");

  if (error) throw error;

  const byProduct = {};
  for (const id of PRODUCT_IDS) {
    byProduct[id] = { available: 0, sold: 0 };
  }
  for (const row of data || []) {
    if (!byProduct[row.product_id]) {
      byProduct[row.product_id] = { available: 0, sold: 0 };
    }
    if (row.status === "available" || row.status === "sold") {
      byProduct[row.product_id][row.status] += 1;
    }
  }
  return byProduct;
}

/** Lightweight version of getStockCounts that only returns `available`. */
export async function getPublicStock(db) {
  const counts = await getStockCounts(db);
  const out = {};
  for (const id of PRODUCT_IDS) {
    out[id] = { available: counts[id]?.available ?? 0 };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lookups (admin support tooling)
// ---------------------------------------------------------------------------

export async function lookupByEmail(db, email) {
  const { data, error } = await db
    .from("keys")
    .select("product_id, key_code_encrypted, email, sold_at, stripe_session_id")
    .eq("status", "sold")
    .ilike("email", email)
    .order("sold_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    product_id: row.product_id,
    key_code: decryptKey(row.key_code_encrypted),
    email: row.email,
    sold_at: row.sold_at,
    stripe_session_id: row.stripe_session_id,
  }));
}

export async function lookupBySession(db, stripeSessionId) {
  const { data, error } = await db
    .from("deliveries")
    .select("stripe_session_id, key_id, product_id, email, delivered_at, keys(key_code_encrypted)")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    stripe_session_id: data.stripe_session_id,
    key_id: data.key_id,
    product_id: data.product_id,
    email: data.email,
    delivered_at: data.delivered_at,
    key_code: data.keys ? decryptKey(data.keys.key_code_encrypted) : null,
  };
}


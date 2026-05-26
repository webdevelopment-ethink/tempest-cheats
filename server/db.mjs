import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const VALID_PRODUCTS = new Set(["arc-1-day", "arc-3-day", "arc-7-day", "arc-30-day"]);

export function assertProductId(productId) {
  if (!VALID_PRODUCTS.has(productId)) {
    throw new Error(
      `Unknown product_id "${productId}". Expected one of: ${[...VALID_PRODUCTS].join(", ")}`
    );
  }
}

export function openDatabase(dbPath = "./data/keys.db") {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      key_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'sold')),
      stripe_session_id TEXT,
      email TEXT,
      sold_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (key_code),
      UNIQUE (stripe_session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_keys_product_status
      ON keys (product_id, status);

    CREATE TABLE IF NOT EXISTS deliveries (
      stripe_session_id TEXT PRIMARY KEY,
      key_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      email TEXT NOT NULL,
      key_code TEXT NOT NULL,
      delivered_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (key_id) REFERENCES keys (id)
    );
  `);
}

export function importKeys(db, productId, keyCodes) {
  assertProductId(productId);

  const insert = db.prepare(`
    INSERT INTO keys (product_id, key_code, status)
    VALUES (?, ?, 'available')
  `);

  const exists = db.prepare(`SELECT 1 FROM keys WHERE key_code = ?`);

  let added = 0;
  let skipped = 0;

  const runMany = db.transaction((codes) => {
    for (const raw of codes) {
      const keyCode = raw.trim();
      if (!keyCode || keyCode.startsWith("#")) continue;

      if (exists.get(keyCode)) {
        skipped += 1;
        continue;
      }

      insert.run(productId, keyCode);
      added += 1;
    }
  });

  runMany(keyCodes);
  return { added, skipped };
}

export function getStockCounts(db) {
  const rows = db
    .prepare(
      `
      SELECT product_id, status, COUNT(*) AS count
      FROM keys
      GROUP BY product_id, status
      ORDER BY product_id, status
    `
    )
    .all();

  const byProduct = {};
  for (const row of rows) {
    if (!byProduct[row.product_id]) {
      byProduct[row.product_id] = { available: 0, sold: 0 };
    }
    byProduct[row.product_id][row.status] = row.count;
  }
  return byProduct;
}

export function findDeliveryBySession(db, stripeSessionId) {
  return db
    .prepare(
      `
      SELECT d.*, k.id AS key_row_id
      FROM deliveries d
      JOIN keys k ON k.id = d.key_id
      WHERE d.stripe_session_id = ?
    `
    )
    .get(stripeSessionId);
}

export function reserveKeyForOrder(db, { productId, email, stripeSessionId }) {
  assertProductId(productId);

  const existing = findDeliveryBySession(db, stripeSessionId);
  if (existing) {
    return {
      alreadyDelivered: true,
      keyCode: existing.key_code,
      productId: existing.product_id,
      email: existing.email,
    };
  }

  const fulfill = db.transaction(() => {
    const available = db
      .prepare(
        `
        SELECT id, key_code
        FROM keys
        WHERE product_id = ? AND status = 'available'
        ORDER BY id ASC
        LIMIT 1
      `
      )
      .get(productId);

    if (!available) {
      const err = new Error(`No keys in stock for ${productId}`);
      err.code = "OUT_OF_STOCK";
      throw err;
    }

    const soldAt = new Date().toISOString();

    db.prepare(
      `
      UPDATE keys
      SET status = 'sold',
          stripe_session_id = ?,
          email = ?,
          sold_at = ?
      WHERE id = ? AND status = 'available'
    `
    ).run(stripeSessionId, email, soldAt, available.id);

    db.prepare(
      `
      INSERT INTO deliveries (stripe_session_id, key_id, product_id, email, key_code)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(stripeSessionId, available.id, productId, email, available.key_code);

    return {
      alreadyDelivered: false,
      keyCode: available.key_code,
      productId,
      email,
    };
  });

  return fulfill();
}

export function lookupByEmail(db, email) {
  return db
    .prepare(
      `
      SELECT product_id, key_code, email, sold_at, stripe_session_id
      FROM keys
      WHERE status = 'sold' AND lower(email) = lower(?)
      ORDER BY sold_at DESC
    `
    )
    .all(email);
}

export function lookupBySession(db, stripeSessionId) {
  return findDeliveryBySession(db, stripeSessionId);
}

export const PRODUCT_IDS = ["arc-1-day", "arc-3-day", "arc-7-day", "arc-30-day"];

export function productDisplayName(productId) {
  const names = {
    "arc-1-day": "Arc Raiders 1 Day",
    "arc-3-day": "Arc Raiders 3 Days",
    "arc-7-day": "Arc Raiders 7 Days",
    "arc-30-day": "Arc Raiders 30 Days",
  };
  return names[productId] || productId;
}

export function getAnalytics(db) {
  const stock = getStockCounts(db);

  const totals = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) AS sold
      FROM keys
    `
    )
    .get();

  const soldByProduct = db
    .prepare(
      `
      SELECT product_id, COUNT(*) AS count
      FROM keys
      WHERE status = 'sold'
      GROUP BY product_id
      ORDER BY product_id
    `
    )
    .all();

  const salesLast7Days = db
    .prepare(
      `
      SELECT date(sold_at) AS day, COUNT(*) AS count
      FROM keys
      WHERE status = 'sold'
        AND sold_at >= datetime('now', '-7 days')
      GROUP BY date(sold_at)
      ORDER BY day ASC
    `
    )
    .all();

  const salesLast30Days = db
    .prepare(`SELECT COUNT(*) AS count FROM keys WHERE status = 'sold' AND sold_at >= datetime('now', '-30 days')`)
    .get().count;

  const salesToday = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM keys
      WHERE status = 'sold'
        AND date(sold_at) = date('now')
    `
    )
    .get().count;

  const recentSales = db
    .prepare(
      `
      SELECT product_id, email, key_code, sold_at, stripe_session_id
      FROM keys
      WHERE status = 'sold'
      ORDER BY sold_at DESC
      LIMIT 50
    `
    )
    .all();

  const lowStock = PRODUCT_IDS.filter((id) => (stock[id]?.available ?? 0) <= 5);

  return {
    stock,
    totals: {
      available: totals?.available ?? 0,
      sold: totals?.sold ?? 0,
    },
    soldByProduct,
    salesLast7Days,
    salesLast30Days,
    salesToday,
    recentSales,
    lowStock,
  };
}

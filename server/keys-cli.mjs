#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  openDatabase,
  importKeys,
  getStockCounts,
  lookupByEmail,
  lookupBySession,
  assertProductId,
} from "./db.mjs";

const KEY_DB_PATH = process.env.KEY_DB_PATH || "./data/keys.db";
const db = openDatabase(KEY_DB_PATH);

const [, , command, ...args] = process.argv;

function usage() {
  console.log(`
Project Tempest — key inventory (SQLite)

Database: ${KEY_DB_PATH}

Commands:
  stock                         Show available/sold counts per product
  import <product-id> <file>    Import keys from a text file (one key per line)
  add <product-id> <key>        Add a single key
  lookup email <address>        Find keys sold to an email (support)
  lookup session <session_id>   Find key for a Stripe checkout session

Product IDs:
  arc-1-day, arc-3-day, arc-7-day, arc-30-day

Examples:
  npm run keys -- import arc-7-day keys/inventory/arc-7-day.txt
  npm run keys -- add arc-1-day MY-LICENSE-KEY-HERE
  npm run keys -- stock
  npm run keys -- lookup email buyer@example.com
`);
}

function cmdStock() {
  const counts = getStockCounts(db);
  const products = ["arc-1-day", "arc-3-day", "arc-7-day", "arc-30-day"];

  console.log("\nStock levels:\n");
  for (const productId of products) {
    const row = counts[productId] || { available: 0, sold: 0 };
    console.log(
      `  ${productId.padEnd(12)}  available: ${String(row.available).padStart(4)}   sold: ${String(row.sold).padStart(4)}`
    );
  }
  console.log("");
}

function cmdImport(productId, filePath) {
  assertProductId(productId);
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(resolved, "utf8").split(/\r?\n/);
  const { added, skipped } = importKeys(db, productId, lines);

  console.log(`\nImported into ${productId} from ${resolved}`);
  console.log(`  Added:   ${added}`);
  console.log(`  Skipped: ${skipped} (duplicate or empty lines)\n`);
  cmdStock();
}

function cmdAdd(productId, keyCode) {
  assertProductId(productId);
  const { added, skipped } = importKeys(db, productId, [keyCode]);
  if (added === 0) {
    console.error("Key was not added (duplicate or empty).");
    process.exit(1);
  }
  console.log(`Added key to ${productId}.`);
  cmdStock();
}

function cmdLookup(kind, value) {
  if (kind === "email") {
    const rows = lookupByEmail(db, value);
    if (!rows.length) {
      console.log(`No sold keys found for ${value}`);
      return;
    }
    console.log(`\nKeys for ${value}:\n`);
    for (const row of rows) {
      console.log(`  ${row.product_id}  ${row.key_code}`);
      console.log(`    sold: ${row.sold_at}  session: ${row.stripe_session_id}\n`);
    }
    return;
  }

  if (kind === "session") {
    const row = lookupBySession(db, value);
    if (!row) {
      console.log(`No delivery found for session ${value}`);
      return;
    }
    console.log(`
Delivery for session ${value}:
  product: ${row.product_id}
  email:   ${row.email}
  key:     ${row.key_code}
  at:      ${row.delivered_at}
`);
    return;
  }

  console.error('Use: lookup email <address>  OR  lookup session <session_id>');
  process.exit(1);
}

switch (command) {
  case "stock":
    cmdStock();
    break;
  case "import":
    cmdImport(args[0], args[1]);
    break;
  case "add":
    cmdAdd(args[0], args[1]);
    break;
  case "lookup":
    cmdLookup(args[0], args[1]);
    break;
  case undefined:
  case "help":
  case "-h":
  case "--help":
    usage();
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    usage();
    process.exit(1);
}

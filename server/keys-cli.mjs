#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  createDbClient,
  importKeys,
  getStockCounts,
  lookupByEmail,
  lookupBySession,
  assertProductId,
} from "./db.mjs";
import { sendKeyEmail } from "./email.mjs";

const [, , command, ...args] = process.argv;

function usage() {
  console.log(`
Project Tempest — key inventory (Supabase, encrypted)

Required env vars (put them in .env at the project root):
  SUPABASE_URL                 https://<your-ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    eyJ... (Settings → API → service_role secret)
  KEY_ENCRYPTION_SECRET        a long random string (32+ chars)

Commands:
  stock                                Show available/sold counts per product
  import <product-id> <file>           Import keys from a text file (one per line)
  import <product-id> --inline <list>  Import comma/whitespace-separated keys inline
  add <product-id> <key>               Add a single key
  lookup email <address>               Find keys sold to an email
  lookup session <session_id>          Find key for a Stripe checkout session
  test-email <address>                 Send a sample delivery email to verify Resend

Product IDs:
  arc-1-day, arc-7-day, arc-30-day

Examples:
  npm run keys -- import arc-7-day keys/inventory/arc-7-day.txt
  npm run keys -- import arc-7-day --inline "ABC-123, DEF-456, GHI-789"
  npm run keys -- add arc-1-day MY-LICENSE-KEY-HERE
  npm run keys -- stock
  npm run keys -- lookup email buyer@example.com
`);
}

function splitInlineKeys(raw) {
  return String(raw || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getDb() {
  try {
    return createDbClient();
  } catch (err) {
    console.error("\n" + err.message);
    console.error("\nFix: copy .env.key-delivery.example to .env and fill in your Supabase keys.\n");
    process.exit(1);
  }
}

async function cmdStock(db) {
  const counts = await getStockCounts(db);
  const products = ["arc-1-day", "arc-7-day", "arc-30-day"];

  console.log("\nStock levels:\n");
  for (const productId of products) {
    const row = counts[productId] || { available: 0, sold: 0 };
    console.log(
      `  ${productId.padEnd(12)}  available: ${String(row.available).padStart(4)}   sold: ${String(row.sold).padStart(4)}`
    );
  }
  console.log("");
}

async function cmdImport(db, productId, source, ...rest) {
  assertProductId(productId);

  let keys = [];
  let label = "";

  if (source === "--inline" || source === "-i") {
    const joined = rest.join(" ");
    keys = splitInlineKeys(joined);
    label = "inline";
  } else {
    const resolved = path.resolve(source);
    if (!fs.existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exit(1);
    }
    keys = fs.readFileSync(resolved, "utf8").split(/\r?\n/);
    label = resolved;
  }

  if (!keys.length) {
    console.error("No keys provided.");
    process.exit(1);
  }

  const { added, skipped } = await importKeys(db, productId, keys);

  console.log(`\nImported into ${productId} from ${label}`);
  console.log(`  Added:   ${added}`);
  console.log(`  Skipped: ${skipped} (duplicate or empty)\n`);
  await cmdStock(db);
}

async function cmdAdd(db, productId, keyCode) {
  assertProductId(productId);
  const { added } = await importKeys(db, productId, [keyCode]);
  if (added === 0) {
    console.error("Key was not added (duplicate or empty).");
    process.exit(1);
  }
  console.log(`Added key to ${productId}.`);
  await cmdStock(db);
}

async function cmdLookup(db, kind, value) {
  if (kind === "email") {
    const rows = await lookupByEmail(db, value);
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
    const row = await lookupBySession(db, value);
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

async function cmdTestEmail(address) {
  if (!address || !/.+@.+\..+/.test(address)) {
    console.error('Provide an email address: npm run keys -- test-email you@example.com');
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY || !process.env.KEY_EMAIL_FROM) {
    console.error("RESEND_API_KEY and KEY_EMAIL_FROM must be set in .env");
    process.exit(1);
  }

  const fakeKey = `TEST-${Date.now().toString(36).toUpperCase()}-DO-NOT-USE`;
  console.log(`Sending test email to ${address} (fake key: ${fakeKey})...`);

  await sendKeyEmail({
    email: address,
    productId: "arc-1-day",
    keyCode: fakeKey,
  });

  console.log(`\n✓ Test email sent. Check ${address} (and the spam folder).`);
  console.log("  This did NOT touch the keys table — inventory is unchanged.\n");
}

async function main() {
  switch (command) {
    case "stock":
      await cmdStock(getDb());
      break;
    case "import":
      await cmdImport(getDb(), args[0], args[1], ...args.slice(2));
      break;
    case "add":
      await cmdAdd(getDb(), args[0], args[1]);
      break;
    case "lookup":
      await cmdLookup(getDb(), args[0], args[1]);
      break;
    case "test-email":
      await cmdTestEmail(args[0]);
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
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

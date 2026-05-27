import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash } from "node:crypto";

/**
 * Key encryption for license keys at rest in Supabase.
 *
 * - Encryption: AES-256-GCM with a random 12-byte IV per row.
 *   Stored format:  "v1:<base64( iv | ciphertext | authTag )>"
 *
 * - Fingerprint: HMAC-SHA256(plaintext) hex.  Deterministic so duplicate
 *   uploads can be detected and key lookups by plaintext work, without
 *   ever storing the plaintext.
 *
 * Both keys are derived from a single secret (KEY_ENCRYPTION_SECRET)
 * so operators only manage one env var.  Different SHA-256 contexts give
 * unrelated subkeys.
 */

const SECRET = process.env.KEY_ENCRYPTION_SECRET || "";

function sha256(input) {
  return createHash("sha256").update(input).digest();
}

function getEncKey() {
  if (!SECRET || SECRET.length < 32) {
    throw new Error(
      "KEY_ENCRYPTION_SECRET is missing or too short (must be at least 32 chars)."
    );
  }
  return sha256("tempest:enc:v1|" + SECRET);
}

function getFpKey() {
  if (!SECRET || SECRET.length < 32) {
    throw new Error(
      "KEY_ENCRYPTION_SECRET is missing or too short (must be at least 32 chars)."
    );
  }
  return sha256("tempest:fingerprint:v1|" + SECRET);
}

export function isCryptoConfigured() {
  return Boolean(SECRET && SECRET.length >= 32);
}

export function encryptKey(plaintext) {
  const encKey = getEncKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, ciphertext, tag]).toString("base64");
  return `v1:${packed}`;
}

export function decryptKey(stored) {
  if (typeof stored !== "string" || !stored) {
    throw new Error("decryptKey: empty input");
  }
  const [version, payload] = stored.split(":", 2);
  if (version !== "v1" || !payload) {
    throw new Error(`decryptKey: unsupported version "${version}"`);
  }
  const encKey = getEncKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 12 + 16) {
    throw new Error("decryptKey: ciphertext too short");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", encKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function fingerprintKey(plaintext) {
  const fpKey = getFpKey();
  return createHmac("sha256", fpKey).update(String(plaintext)).digest("hex");
}

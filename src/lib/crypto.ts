import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.CRYPTO_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("CRYPTO_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encrypted: string): string {
  const key = getKey();
  const [ivHex, authTagHex, dataHex] = encrypted.split(":");
  if (!ivHex || !authTagHex || !dataHex) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function maskKey(key: string): string {
  if (key.length <= 4) return "••••••••••••";
  return "••••••••••••" + key.slice(-4);
}

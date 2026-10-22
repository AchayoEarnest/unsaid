import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
// App-level AES-256-GCM for messages and journal. DATA_KEY = base64 of 32 bytes (load from your KMS in production).
const key = () => Buffer.from(process.env.DATA_KEY ?? "", "base64");
export function seal(text: string): Buffer {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
export function open(b: Buffer): string {
  const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

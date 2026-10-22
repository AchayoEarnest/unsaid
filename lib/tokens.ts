import { createHash, randomBytes } from "crypto";
import { q } from "./db";
const h = (t: string) => createHash("sha256").update(t).digest();
export async function makeToken(userId: string, kind: "verify" | "reset", hours: number) {
  const t = randomBytes(32).toString("base64url");
  await q("INSERT INTO auth_tokens (token_hash,user_id,kind,expires_at) VALUES ($1,$2,$3,now()+($4||' hours')::interval)", [h(t), userId, kind, String(hours)]);
  return t;
}
export async function useToken(t: string, kind: "verify" | "reset") {
  const [r] = await q<{ user_id: string }>("UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at>now() RETURNING user_id", [h(t), kind]);
  return r?.user_id ?? null;
}

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { q } from "./db";

const hash = (t: string) => createHash("sha256").update(t).digest();
const DAYS = 30;

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await q("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 days')", [hash(token), userId]);
  (await cookies()).set("sid", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: DAYS * 86400 });
}

export async function currentUser() {
  const token = (await cookies()).get("sid")?.value;
  if (!token) return null;
  const [u] = await q<{ id: string; is_minor: boolean; sanction: string }>(
    `SELECT u.id,u.is_minor,u.sanction FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL`, [hash(token)]);
  return u ?? null;
}

/** CSRF defence for cookie-authenticated writes: the Origin header must be our own site. */
export function sameOrigin(req: Request) {
  const o = req.headers.get("origin");
  return !!o && o === process.env.APP_ORIGIN;
}

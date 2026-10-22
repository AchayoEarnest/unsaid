import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { createSession } from "@/lib/session";

const fail = () => Response.redirect(`${process.env.APP_ORIGIN}/?auth=failed`, 302);
export async function GET(req: Request) {
  const u = new URL(req.url), jar = await cookies();
  if (!u.searchParams.get("code") || u.searchParams.get("state") !== jar.get("g_state")?.value) return fail();
  jar.delete("g_state");
  const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({
    code: u.searchParams.get("code")!, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: `${process.env.APP_ORIGIN}/api/auth/google/callback`, grant_type: "authorization_code" }) }).then(r => r.json());
  const info = tok.access_token && await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json());
  if (!info?.sub || !info.email_verified) return fail();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    let r = await c.query("SELECT id FROM users WHERE google_sub=$1 AND deleted_at IS NULL", [info.sub]);
    if (!r.rows[0]) {
      // New social users get the most protected defaults until they confirm their age group in onboarding.
      r = await c.query("INSERT INTO users (email,google_sub,is_minor,age_confirmed,email_verified_at) VALUES (lower($1),$2,true,false,now()) RETURNING id", [info.email, info.sub]);
      await c.query("INSERT INTO profiles (user_id,nickname,allow_requests) VALUES ($1,$2,false)", [r.rows[0].id, "Friend" + Math.floor(Math.random() * 9000 + 1000)]);
    }
    await c.query("COMMIT");
    await createSession(r.rows[0].id);
  } catch { await c.query("ROLLBACK"); return fail(); } finally { c.release(); }
  return Response.redirect(`${process.env.APP_ORIGIN}/`, 302);
}

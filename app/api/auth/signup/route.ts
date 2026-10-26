import { z } from "zod";
import argon2 from "argon2";
import { pool } from "@/lib/db";
import { createSession, sameOrigin } from "@/lib/session";
import { clientIp, limited } from "@/lib/rate";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(128),
  nickname: z.string().trim().min(2).max(24),
  isMinor: z.boolean(),
  countryCode: z.string().length(2).optional(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad origin" }, { status: 403 });
  const ip = clientIp(req);
  if (await limited(`signup:${ip}`, 5, 60 * 60_000)) return Response.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Please check your details.", fields: p.error.flatten().fieldErrors }, { status: 400 });
  const { email, password, nickname, isMinor, countryCode } = p.data;

  const hashed = await argon2.hash(password, { type: argon2.argon2id });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const u = await c.query("INSERT INTO users (email,password_hash,is_minor,country_code) VALUES (lower($1),$2,$3,$4) RETURNING id", [email, hashed, isMinor, countryCode ?? null]);
    // Teens start with private requests off.
    await c.query("INSERT INTO profiles (user_id,nickname,allow_requests) VALUES ($1,$2,$3)", [u.rows[0].id, nickname, !isMinor]);
    await c.query("COMMIT");
    await createSession(u.rows[0].id);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e: any) {
    await c.query("ROLLBACK");
    // Same message whether or not the email exists, so accounts can't be enumerated.
    return Response.json({ error: "We couldn't create that account." }, { status: e.code === "23505" ? 409 : 500 });
  } finally { c.release(); }
}

import { z } from "zod";
import argon2 from "argon2";
import { q } from "@/lib/db";
import { createSession, sameOrigin } from "@/lib/session";
import { clientIp, limited } from "@/lib/rate";
import { err } from "@/lib/http";

const Body = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
// A real argon2id hash of a random value, verified when the account doesn't exist so timing stays similar.
let dummy: Promise<string> | undefined;
const getDummy = () => (dummy ??= argon2.hash("not-a-real-password", { type: argon2.argon2id }));

export async function POST(req: Request) {
  if (!sameOrigin(req)) return err("Bad origin", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err("Please enter your email and password.");
  const ip = clientIp(req), email = p.data.email.toLowerCase();
  // Per IP+email stops simple guessing; the per-email cap stops guessing spread across many IPs.
  if (await limited(`signin:${ip}:${email}`, 8, 15 * 60_000) || await limited(`signin-email:${email}`, 30, 15 * 60_000))
    return err("Too many attempts. Try again in a few minutes.", 429);
  const [u] = await q<{ id: string; password_hash: string | null }>("SELECT id,password_hash FROM users WHERE email=lower($1) AND deleted_at IS NULL", [p.data.email]);
  const ok = await argon2.verify(u?.password_hash ?? (await getDummy()), p.data.password).catch(() => false);
  if (!u || !u.password_hash || !ok) return err("That email and password don't match.", 401);
  await createSession(u.id);
  return Response.json({ ok: true });
}

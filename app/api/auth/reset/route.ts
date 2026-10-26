import { z } from "zod";
import argon2 from "argon2";
import { q } from "@/lib/db";
import { sameOrigin } from "@/lib/session";
import { clientIp, limited } from "@/lib/rate";
import { err } from "@/lib/http";
import { makeToken, useToken } from "@/lib/tokens";
import { sendMail } from "@/lib/mail";

// Step 1: ask for a link. The answer is always the same so emails can't be probed.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return err("Bad origin", 403);
  const p = z.object({ email: z.string().email() }).safeParse(await req.json().catch(() => null));
  const ip = clientIp(req);
  if (await limited(`reset:${ip}`, 5, 3600_000)) return err("Too many requests. Please try again later.", 429);
  if (p.success) {
    const [u] = await q<{ id: string }>("SELECT id FROM users WHERE email=lower($1) AND password_hash IS NOT NULL AND deleted_at IS NULL", [p.data.email]);
    if (u) await sendMail(p.data.email, "Reset your Unsaid password", `Reset link (valid for 1 hour): ${process.env.APP_ORIGIN}/app.html?reset=${await makeToken(u.id, "reset", 1)}`);
  }
  return Response.json({ ok: true, note: "If that email has an account, a reset link is on its way." });
}
// Step 2: set a new password. Signs the user out everywhere.
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return err("Bad origin", 403);
  const p = z.object({ token: z.string().min(20), password: z.string().min(10).max(128) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return err("Please choose a password with at least 10 characters.");
  const id = await useToken(p.data.token, "reset");
  if (!id) return err("This link has expired. Please request a new one.", 400);
  await q("UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1", [id, await argon2.hash(p.data.password, { type: argon2.argon2id })]);
  await q("DELETE FROM sessions WHERE user_id=$1", [id]);
  return Response.json({ ok: true });
}

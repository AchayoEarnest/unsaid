import { q } from "@/lib/db";
import { handler } from "@/lib/http";
import { makeToken, useToken } from "@/lib/tokens";
import { sendMail } from "@/lib/mail";
export const POST = (req: Request) => handler(req, async me => {
  const [u] = await q<{ email: string; email_verified_at: string | null }>("SELECT email,email_verified_at FROM users WHERE id=$1", [me.id]);
  if (u.email_verified_at) return Response.json({ ok: true, already: true });
  const t = await makeToken(me.id, "verify", 48);
  await sendMail(u.email, "Confirm your Unsaid email", `Confirm your email: ${process.env.APP_ORIGIN}/api/auth/verify?token=${t}\nThis link works for 48 hours.`);
  return Response.json({ ok: true });
}, { rate: [3, 3600_000] });
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("token") ?? "", id = t && await useToken(t, "verify");
  if (id) await q("UPDATE users SET email_verified_at=now() WHERE id=$1", [id]);
  return Response.redirect(`${process.env.APP_ORIGIN}/app.html?verified=${id ? 1 : 0}`, 302);
}

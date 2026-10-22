import { randomBytes } from "crypto";
import { cookies } from "next/headers";
export async function GET() {
  const state = randomBytes(16).toString("base64url");
  (await cookies()).set("g_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${process.env.APP_ORIGIN}/api/auth/google/callback`, response_type: "code", scope: "openid email", state }).toString();
  return Response.redirect(u.toString(), 302);
}

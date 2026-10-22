import { createHash } from "crypto";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { sameOrigin } from "@/lib/session";
import { err } from "@/lib/http";
export async function POST(req: Request) {
  if (!sameOrigin(req)) return err("Bad origin", 403);
  const jar = await cookies(), t = jar.get("sid")?.value;
  if (t) await q("DELETE FROM sessions WHERE token_hash=$1", [createHash("sha256").update(t).digest()]);
  jar.delete("sid");
  return Response.json({ ok: true });
}

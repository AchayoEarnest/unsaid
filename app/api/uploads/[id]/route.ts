import { readFile } from "fs/promises";
import path from "path";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { Ctx } from "@/lib/http";
export async function GET(_: Request, { params }: Ctx<{ id: string }>) {
  const { id } = await params, me = await currentUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [u] = await q<{ mime: string; status: string }>("SELECT mime,status FROM uploads WHERE id=$1 AND (status='approved' OR user_id=$2)", [id, me?.id ?? null]);
  if (!u) return new Response("Not found", { status: 404 });
  const b = await readFile(path.join(process.env.UPLOAD_DIR ?? "./uploads", id));
  return new Response(new Uint8Array(b), { headers: { "Content-Type": u.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": u.status === "approved" ? "public, max-age=3600" : "private, no-store" } });
}

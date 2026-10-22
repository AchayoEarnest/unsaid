import { q } from "@/lib/db";
import { handler } from "@/lib/http";
export const GET = (req: Request) => handler(req, async () => Response.json({ items: await q("SELECT id,actor_id,action,target,created_at FROM audit_log ORDER BY id DESC LIMIT 100") }), { staff: "admin" });

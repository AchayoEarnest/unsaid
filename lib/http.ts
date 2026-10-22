import { q } from "./db";
import { currentUser, sameOrigin } from "./session";
import { limited } from "./rate";

export type Me = { id: string; is_minor: boolean; sanction: string };
export const err = (m: string, s = 400) => Response.json({ error: m }, { status: s });
export type Ctx<P = {}> = { params: Promise<P> };

/** Wraps a route: origin check on writes, auth, suspension, rate limit, optional staff role. */
export async function handler(req: Request, fn: (me: Me) => Promise<Response>, o: { staff?: "moderator" | "admin"; rate?: [number, number] } = {}) {
  try {
    const write = req.method !== "GET";
    if (write && !sameOrigin(req)) return err("Bad origin", 403);
    const me = await currentUser();
    if (!me) return err("Please sign in.", 401);
    if (write && me.sanction === "suspension") return err("Your account is suspended.", 403);
    if (o.rate && limited(`${new URL(req.url).pathname}:${me.id}`, o.rate[0], o.rate[1])) return err("Slow down for a moment.", 429);
    if (o.staff) {
      const [s] = await q<{ role: string }>("SELECT role FROM staff WHERE user_id=$1", [me.id]);
      if (!s || (o.staff === "admin" && s.role !== "admin")) return err("Not allowed", 403);
    }
    return await fn(me);
  } catch (e) { console.error(e); return err("Something went wrong. Please try again.", 500); }
}
export const json = async (req: Request) => req.json().catch(() => null);

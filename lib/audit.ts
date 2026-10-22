import { q } from "./db";
export const audit = (actor: string | null, action: string, target?: string, meta?: object) =>
  q("INSERT INTO audit_log (actor_id,action,target,meta) VALUES ($1,$2,$3,$4)", [actor, action, target ?? null, meta ? JSON.stringify(meta) : null]);

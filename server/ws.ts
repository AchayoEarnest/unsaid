// Realtime server: authenticates the same session cookie, then pushes events for the user's own conversations.
// Run separately: npx tsx server/ws.ts. Scales horizontally because Postgres NOTIFY fans out to every instance.
import { createHash } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Pool, Client } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const wss = new WebSocketServer({ port: Number(process.env.WS_PORT ?? 4000), verifyClient: (i, cb) => {
  const ok = i.origin === process.env.APP_ORIGIN; cb(ok, ok ? 200 : 403);
} });
const online = new Map<string, Set<WebSocket>>();

wss.on("connection", async (ws, req) => {
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  const r = sid && (await pool.query("SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()", [createHash("sha256").update(sid).digest()])).rows[0];
  if (!r) return ws.close(4401);
  const uid: string = r.user_id;
  (online.get(uid) ?? online.set(uid, new Set()).get(uid)!).add(ws);
  ws.on("message", async raw => {  // typing indicator, only to members of that conversation
    try {
      const m = JSON.parse(raw.toString());
      if (m.type !== "typing" || typeof m.convo !== "string") return;
      const { rows } = await pool.query("SELECT user_id FROM conversation_members WHERE conversation_id=$1", [m.convo]);
      if (!rows.some(x => x.user_id === uid)) return;
      for (const o of rows) if (o.user_id !== uid) online.get(o.user_id)?.forEach(s => s.send(JSON.stringify({ type: "typing", convo: m.convo })));
    } catch { /* ignore malformed frames */ }
  });
  ws.on("close", () => online.get(uid)?.delete(ws));
});

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query("LISTEN msg");
  c.on("notification", async n => {
    const { convo, from, msg } = JSON.parse(n.payload!);
    const { rows } = await pool.query("SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2 AND NOT muted", [convo, from]);
    for (const o of rows) online.get(o.user_id)?.forEach(s => s.send(JSON.stringify({ type: "message", convo, msg })));
  });
})();

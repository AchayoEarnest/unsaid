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
  // Same rules as the HTTP side: live session, account not deleted, not suspended.
  const r = sid && (await pool.query(`SELECT s.user_id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL AND u.sanction<>'suspension'`, [createHash("sha256").update(sid).digest()])).rows[0];
  if (!r) return ws.close(4401);
  const uid: string = r.user_id;
  (online.get(uid) ?? online.set(uid, new Set()).get(uid)!).add(ws);
  alive.set(ws, true); ws.on("pong", () => alive.set(ws, true));
  ws.on("message", async raw => {  // typing indicator, only to members of that conversation
    try {
      const m = JSON.parse(raw.toString());
      if (m.type !== "typing" || typeof m.convo !== "string") return;
      if (!/^[0-9a-f-]{36}$/i.test(m.convo)) return;
      const { rows } = await pool.query(`SELECT cm.user_id FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id AND c.deleted_at IS NULL
        WHERE cm.conversation_id=$1 AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=cm.user_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=cm.user_id))`, [m.convo, uid]);
      if (!rows.some(x => x.user_id === uid)) return;
      for (const o of rows) if (o.user_id !== uid) online.get(o.user_id)?.forEach(s => s.send(JSON.stringify({ type: "typing", convo: m.convo })));
    } catch { /* ignore malformed frames */ }
  });
  ws.on("close", () => { const s = online.get(uid); s?.delete(ws); if (s?.size === 0) online.delete(uid); });
});

// Drop sockets that stopped answering pings (sleeping phones, dead networks), so `online` doesn't fill with ghosts.
const alive = new WeakMap<WebSocket, boolean>();
setInterval(() => wss.clients.forEach(ws => {
  if (!alive.get(ws)) return ws.terminate();
  alive.set(ws, false); ws.ping();
}), 30_000);

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query("LISTEN msg");
  c.on("notification", async n => {
    const { convo, from, msg } = JSON.parse(n.payload!);
    const { rows } = await pool.query("SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2 AND NOT muted", [convo, from]);
    for (const o of rows) online.get(o.user_id)?.forEach(s => s.send(JSON.stringify({ type: "message", convo, msg })));
  });
})();

// End-to-end API test. Needs the dev server (npm run dev), the realtime server (npm run ws) and a loaded database.
// Run: npm run test:api   (it clears the shared rate_limits table first, since signup is limited to 5 per hour per IP)
import fs from "fs";
import pg from "pg";
import WebSocket from "ws";
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const BASE = env.APP_ORIGIN || "http://localhost:3000", db = new pg.Pool({ connectionString: env.DATABASE_URL });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok   " + m); } else { fail++; console.log("FAIL " + m); } };
class C { c = ""; async r(method, path, body, noOrigin) {
  const h = noOrigin ? {} : { Origin: BASE }; if (body && !(body instanceof FormData)) h["Content-Type"] = "application/json"; if (this.c) h.Cookie = this.c;
  const res = await fetch(BASE + path, { method, headers: h, redirect: "manual", body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  for (const x of res.headers.getSetCookie?.() ?? []) { const kv = x.split(";")[0]; this.c = kv.endsWith("=") ? "" : kv; }
  const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: res.status, j, t, res };
} }
await db.query("DELETE FROM rate_limits");
const run = Date.now(), pw = "correct-horse-9";
const mk = async (n, minor) => { const c = new C(); const r = await c.r("POST", "/api/auth/signup", { email: `${n}${run}@example.com`, password: pw, nickname: n, isMinor: minor }); ok(r.s === 201, `sign up ${n}${minor ? " (under 18)" : ""}`); c.email = `${n}${run}@example.com`; return c; };
const A = await mk("Alice", false), B = await mk("Brian", false), T1 = await mk("Teen1", true), T2 = await mk("Teen2", true), D = await mk("Dora", false);
const uid = async c => (await db.query("SELECT id FROM users WHERE email=$1", [c.email.toLowerCase()])).rows[0].id;

// posts, masking, moderation screen
const p1 = (await A.r("POST", "/api/posts", { body: "I'm tired of pretending I'm okay.", identity: "anonymous", moods: ["numb"] })).j;
ok(p1.status === "live", "clean post goes live");
const bad = (await B.r("POST", "/api/posts", { body: "how old are you? add me on snap", identity: "nickname" })).j;
ok(bad.status === "in_review", "grooming-style post held for review");
const feed = await A.r("GET", "/api/posts");
ok(!feed.t.includes("author_id") && feed.t.includes("tired of pretending"), "feed shows post, never author_id");
ok(!feed.t.includes("add me on snap"), "flagged post not public");
ok((await A.r("POST", "/api/posts", { body: "x" }, true)).s === 403, "write without Origin header is refused");
ok((await new C().r("POST", "/api/posts", { body: "x" })).s === 401, "posting while signed out is refused");

// comments, helpful, reactions, saves, reports
const c1 = await B.r("POST", `/api/posts/${p1.id}/comments`, { body: "You're not alone. I've felt this too." });
ok(c1.s === 201 && c1.j.status === "live", "supportive reply posts");
ok((await B.r("POST", `/api/posts/${p1.id}/comments`, { body: "nobody would miss you" })).s === 422, "harmful reply blocked");
const cl = await A.r("GET", `/api/posts/${p1.id}/comments`);
ok(cl.j.items.length === 1 && !cl.t.includes("author_id"), "replies listed without author ids");
ok((await B.r("POST", `/api/comments/${c1.j.id}/helpful`)).s === 403, "only the post author can mark helpful");
ok((await A.r("POST", `/api/comments/${c1.j.id}/helpful`)).s === 200, "post author marks reply helpful");
ok((await B.r("GET", "/api/notifications")).j.items.some(n => n.kind === "helpful"), "replier is notified");
ok((await A.r("POST", `/api/comments/${c1.j.id}/helpful`)).s === 200 && (await B.r("GET", "/api/notifications")).j.items.filter(n => n.kind === "helpful").length === 1, "marking helpful twice notifies once");
ok((await A.r("POST", "/api/comments/not-a-uuid/helpful")).s === 404, "malformed id is a 404, not a server error");
const priv = (await A.r("POST", "/api/posts", { body: "Just for me.", visibility: "private" })).j;
ok((await B.r("POST", `/api/posts/${priv.id}/comments`, { body: "hi" })).s === 404 && (await B.r("GET", `/api/posts/${priv.id}/comments`)).j.items.length === 0, "private posts can't be replied to or read by others");
ok((await B.r("PUT", `/api/posts/${p1.id}/react`, { kind: "love" })).s === 200, "supportive reaction");
ok((await B.r("PUT", `/api/posts/${p1.id}/react`, { kind: "like" })).s === 400, "popularity-style reaction rejected");
ok((await B.r("PUT", `/api/posts/${p1.id}/react`, { kind: "love" })).s === 200, "repeating a reaction is harmless");
ok(JSON.stringify((await B.r("GET", `/api/posts/${p1.id}/react`)).j.kinds) === '["love"]', "user sees only their own reactions");
ok((await A.r("GET", `/api/posts/${p1.id}/react`)).j.kinds.length === 0, "other users' reactions stay private");
ok((await B.r("DELETE", `/api/posts/${p1.id}/react?kind=love`)).s === 200 && (await B.r("GET", `/api/posts/${p1.id}/react`)).j.kinds.length === 0, "reaction can be taken back");
ok((await B.r("DELETE", `/api/posts/${p1.id}/react?kind=bogus`)).s === 400, "unknown reaction kind rejected on delete");
ok((await B.r("PUT", `/api/posts/00000000-0000-0000-0000-000000000000/react`, { kind: "love" })).s === 404 && (await B.r("PUT", `/api/posts/not-a-uuid/react`, { kind: "love" })).s === 404, "reacting to a missing post is a 404");
ok((await B.r("PUT", `/api/posts/${p1.id}/save`)).s === 200, "save a story");
ok((await B.r("GET", `/api/posts/${p1.id}/save`)).j.saved === true, "saved state readable");
ok((await B.r("DELETE", `/api/posts/${p1.id}/save`)).s === 200 && (await B.r("GET", `/api/posts/${p1.id}/save`)).j.saved === false, "story can be unsaved");
ok((await B.r("PUT", `/api/posts/${p1.id}/save`)).s === 200, "save it again");
ok((await B.r("POST", "/api/reports", { target: "post", targetId: p1.id, reason: "test report" })).s === 201, "report a post");

// private connection + encrypted messages
ok((await B.r("POST", "/api/requests", { postId: p1.id })).s === 202, "private request sent (neutral reply)");
await B.r("POST", "/api/requests", { postId: p1.id });
ok((await db.query("SELECT count(*) FROM notifications WHERE user_id=$1 AND kind='request'", [await uid(A)])).rows[0].count === "1", "repeating a request doesn't notify again");
const rq = await A.r("GET", "/api/requests");
ok(rq.j.items.length === 1 && !rq.t.includes("from_user"), "recipient sees request without requester identity");
const acc = await A.r("PATCH", `/api/requests/${rq.j.items[0].id}`, { action: "accept" });
ok(!!acc.j.conversationId, "request accepted, conversation created");
const cv = acc.j.conversationId;
ok((await B.r("GET", "/api/conversations")).j.items.length === 1, "requester sees the conversation");

// realtime
const got = new Promise(res => { const w = new WebSocket(env.WS_URL || "ws://localhost:4000", { headers: { Origin: BASE, Cookie: A.c } }); w.on("message", d => { res(JSON.parse(d.toString())); w.close(); }); w.on("error", () => res(null)); setTimeout(() => res(null), 5000); });
await new Promise(r => setTimeout(r, 800));
ok((await B.r("POST", `/api/conversations/${cv}/messages`, { body: "hello there, secret words" })).s === 201, "message sent");
const ev = await got; ok(ev && ev.type === "message" && ev.convo === cv, "realtime event delivered over WebSocket");
const ms = await A.r("GET", `/api/conversations/${cv}/messages`);
ok(ms.j.items.some(m => m.body === "hello there, secret words"), "recipient reads the message");
const raw = (await db.query("SELECT body_enc FROM messages WHERE conversation_id=$1", [cv])).rows[0].body_enc;
ok(!raw.toString("latin1").includes("secret words"), "message is encrypted in the database");
const cr = await A.r("POST", `/api/conversations/${cv}/messages`, { body: "I want to die" });
ok(cr.s === 201 && cr.j.showHelp === true, "crisis wording triggers the help prompt");
const al = (await db.query("SELECT source FROM safety_alerts WHERE source LIKE 'message:%'")).rows;
ok(al.length >= 1, "safety alert stored as a pointer only");

// teen protections
const pt = (await T1.r("POST", "/api/posts", { body: "School has been really stressful lately.", identity: "anonymous" })).j;
await A.r("POST", "/api/requests", { postId: pt.id });
ok((await T1.r("GET", "/api/requests")).j.items.length === 0, "adult request to a teen is silently blocked");
await T1.r("POST", "/api/requests", { postId: p1.id });
ok((await A.r("GET", "/api/requests")).j.items.length === 0, "teen request to an adult is silently blocked");
await T2.r("PATCH", "/api/me", { allowRequests: true });
ok((await db.query("SELECT allow_requests FROM profiles WHERE user_id=$1", [await uid(T2)])).rows[0].allow_requests === false, "teen cannot switch private requests on");
await T2.r("PATCH", "/api/me", { isMinor: false });
ok((await db.query("SELECT is_minor FROM users WHERE id=$1", [await uid(T2)])).rows[0].is_minor === true, "teen cannot switch their account to adult");

// reported conversation: audited reveal by moderators
ok((await A.r("POST", "/api/reports", { target: "conversation", targetId: cv, reason: "Reported by a participant" })).s === 201, "participant reports the conversation");

// blocking
ok((await A.r("POST", `/api/conversations/${cv}/block`)).s === 200, "block from a conversation");
ok((await B.r("POST", `/api/conversations/${cv}/messages`, { body: "hi" })).s === 403, "blocked sender cannot message");

// moderation (make Alice an admin directly in the database)
await db.query("INSERT INTO staff (user_id,role) VALUES ($1,'admin') ON CONFLICT DO NOTHING", [await uid(A)]);
ok((await B.r("GET", "/api/mod/queue")).s === 403, "non-staff cannot open the moderation queue");
const q = await A.r("GET", "/api/mod/queue");
const fl = q.j.items.find(i => i.target_id === bad.id);
ok(!!fl, "flagged post appears in the queue");
ok((await A.r("POST", `/api/mod/cases/${fl.id}`, { action: "remove" })).s === 200, "moderator removes the post");
ok((await db.query("SELECT mod_status FROM posts WHERE id=$1", [bad.id])).rows[0].mod_status === "removed", "removed post is marked removed");
const rep = q.j.items.find(i => i.target_id === p1.id && i.reason === "test report");
ok((await A.r("POST", `/api/mod/cases/${rep.id}`, { action: "dismiss" })).s === 200, "moderator dismisses a report");
const rc = (await A.r("GET", "/api/mod/queue?severity=3")).j.items.find(i => i.target_id === cv);
ok(!!rc && !JSON.stringify(rc).includes("secret words"), "reported conversation is queued without message text");
const hist = await A.r("GET", `/api/mod/cases/${rc.id}`);
ok(hist.s === 200 && /^U-[0-9A-F]{8}$/.test(hist.j.subject.handle) && hist.j.canReveal && !hist.t.includes(await uid(B)), "case history names the reported person by pseudonym only");
ok((await A.r("POST", `/api/mod/cases/${rc.id}/reveal`, { reason: "short" })).s === 400, "reveal needs a written reason");
ok((await B.r("POST", `/api/mod/cases/${rc.id}/reveal`, { reason: "checking this report carefully" })).s === 403, "non-staff cannot reveal");
const rv = await A.r("POST", `/api/mod/cases/${rc.id}/reveal`, { reason: "checking this report carefully" });
ok(rv.s === 200 && rv.j.items.some(m => m.body === "hello there, secret words" && m.from === "Reported person"), "moderator reads the reported conversation");
ok((await db.query("SELECT meta->>'reason' AS r FROM audit_log WHERE action='case.reveal' AND target=$1", [rc.id])).rows[0]?.r === "checking this report carefully", "reveal is audited with its reason");
ok((await A.r("POST", `/api/mod/cases/${rc.id}`, { action: "warn" })).s === 200 && (await db.query("SELECT sanction FROM users WHERE id=$1", [await uid(B)])).rows[0].sanction === "warning", "warning a reported conversation sanctions the other member");
ok(+(await db.query("SELECT count(*) FROM audit_log WHERE action LIKE 'case.%'")).rows[0].count >= 2, "actions written to the audit log");
ok((await A.r("GET", "/api/admin/stats")).s === 200 && (await B.r("GET", "/api/admin/stats")).s === 403, "admin stats are admin-only");
ok((await A.r("GET", "/api/admin/audit")).j.items.length >= 2, "audit log readable by admins");

// journal, export, uploads
ok((await B.r("POST", "/api/journal", { body: "Private entry about my week", mood: "hopeful", tags: ["week"] })).s === 201, "journal entry saved");
ok((await new C().r("GET", "/api/journal")).s === 401, "journal is closed to signed-out users");
ok((await B.r("GET", "/api/me/export")).t.includes("Private entry about my week"), "data export includes the journal");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const fd = new FormData(); fd.append("file", new Blob([png], { type: "image/png" }), "a.png");
const up = await B.r("POST", "/api/uploads", fd); ok(up.s === 201, "image upload accepted");
const fd2 = new FormData(); fd2.append("file", new Blob(["not an image"], { type: "image/png" }), "a.png");
ok((await B.r("POST", "/api/uploads", fd2)).s === 400, "fake image rejected by file contents");
ok((await fetch(`${BASE}/api/uploads/${up.j.id}`)).status === 404, "pending image hidden from the public");
ok((await B.r("GET", `/api/uploads/${up.j.id}`)).s === 200, "owner can see their pending image");
ok((await A.r("POST", "/api/mod/uploads", { id: up.j.id, action: "approve" })).s === 200, "moderator approves the image");
ok((await fetch(`${BASE}/api/uploads/${up.j.id}`)).status === 200, "approved image is public");

// misc
ok((await new C().r("GET", "/api/search?q=tired")).t.includes("tired of pretending"), "search finds the post");
ok((await new C().r("GET", "/api/help?country=KE")).j.items.length >= 1, "help resources load while signed out");
ok((await new C().r("POST", "/api/cron")).s === 403, "cron refuses without its secret");
ok((await new C().r("POST", "/api/auth/reset", { email: "nobody@example.com" })).s === 200, "reset request gives a neutral answer");
ok((await new C().r("PUT", "/api/auth/reset", { token: "x".repeat(30), password: "another-long-pass" })).s === 400, "bad reset token rejected");
ok((await new C().r("POST", "/api/auth/signin", { email: A.email, password: "wrong-password-1" })).s === 401, "wrong password rejected");
ok((await new C().r("POST", "/api/auth/signin", { email: A.email, password: pw })).s === 200, "correct password signs in");

// account deletion
await D.r("POST", "/api/posts", { body: "A post that should vanish.", identity: "nickname" });
const dId = await uid(D);
ok((await D.r("POST", "/api/me/delete", { password: "wrong-password-1" })).s === 403, "deletion needs the right password");
ok((await D.r("POST", "/api/me/delete", { password: pw })).s === 200, "account deleted");
ok((await new C().r("POST", "/api/auth/signin", { email: D.email, password: pw })).s === 401, "deleted account cannot sign in");
ok((await db.query("SELECT count(*) FROM posts WHERE author_id=$1 AND deleted_at IS NULL", [dId])).rows[0].count === "0", "deleted user's posts are taken down");

console.log(`\n${pass} passed, ${fail} failed`); await db.end(); process.exit(fail ? 1 : 0);

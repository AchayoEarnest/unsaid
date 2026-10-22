// Loads the real UI (public/app.html + api.js + api2.js) in a simulated browser against the running server and clicks through it.
// Needs: npm run dev, a loaded database (npm run db:demo helps). Run: npm run test:ui
import fs from "fs"; import pg from "pg"; import { JSDOM, VirtualConsole } from "jsdom";
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const BASE = env.APP_ORIGIN || "http://localhost:3000", db = new pg.Pool({ connectionString: env.DATABASE_URL });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "ok   " : "FAIL ") + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(150); } return f(); };
// sign up a user to browse as, and make them staff so the admin screens can load
const email = `ui${Date.now()}@example.com`; let cookie = "";
const su = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "correct-horse-9", nickname: "UiTester", isMinor: false }) });
cookie = su.headers.getSetCookie()[0].split(";")[0]; ok(su.status === 201, "test user signed up");
await db.query("INSERT INTO staff SELECT id,'admin' FROM users WHERE email=$1", [email]);
const errs = []; const vc = new VirtualConsole(); vc.on("jsdomError", e => errs.push(e.message)); vc.on("error", e => errs.push(String(e)));
const dom = await JSDOM.fromURL(BASE + "/app.html", { runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
  w.fetch = (u, o = {}) => fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), Origin: BASE, Cookie: cookie } });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} }); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
  w.addEventListener("error", e => errs.push(e.message + " @ " + String((e.error && e.error.stack) || "").split("\n").slice(0, 3).join(" | "))); w.localStorage.setItem("unsaid_onboarded", "1"); } });
const w = dom.window, d = w.document, $ = s => d.querySelector(s), ev = c => w.eval(c), txt = () => $("#app").textContent;
const md = () => [...d.querySelectorAll(".md")].pop(), closeTop = () => [...d.querySelectorAll("[data-x]")].pop()?.click();
await wait(3000);
ok(txt().includes("Sometimes you don’t need answers"), "home page renders");
ok(d.querySelectorAll(".st").length > 0 && ev("Object.keys(st.api||{}).length") > 0, "wall shows real posts from the API");
ok(!!$("#today .st") && ev("!!st.hero") && $("#today .st").getAttribute("onclick").includes(ev("st.hero.id")) && $("#today .st .f").textContent.includes(`💬 ${ev("st.hero.re")}`), "today card shows a real post and reply count");
$("#wall .st").click(); await wait(1200);
ok(!!md() && md().textContent.includes("Responses"), "clicking a sticker opens its thread");
ok(md() && md().querySelectorAll("[data-r]").length === 6, "six supportive reactions shown");
closeTop();
ok(!$(".ov"), "no onboarding dialog for a returning user");
ok(!!$("#authbtn") && $("#authbtn").textContent === "Sign out", "header shows signed-in state");
for (const [page, expect] of [["discover", "Someone’s got you"], ["community", "community mood"], ["messages", "Requests"], ["journal", "Encrypted"], ["journey", "Progress"], ["admin", "Admin"], ["profile", "Edit profile"]]) {
  w.go(page); ok(await until(() => txt().includes(expect)), `${page} screen loads`);
}
w.go("admin"); w.atab("ov");
ok(await until(() => /Posts today/.test(txt())), "admin overview shows live stats");
w.go("admin"); w.atab("q"); ok(await until(() => /Queue is clear|Severity/.test(txt())), "admin review queue loads");
w.go("admin"); w.atab("log"); ok(await until(() => txt().includes("can’t be edited")), "admin audit log loads");
// journal save through the UI
w.go("journal"); await until(() => $("#je")); $("#je").value = "Wrote this from the UI test"; $('[data-j="save"]').click(); await wait(1500);
ok(txt().includes("Wrote this from the UI test"), "journal entry saved and listed");
// posting through the share form (unique body per run so reruns against the same database don't collide)
const shareBody = `Posting from the UI test ${Date.now()}, feeling hopeful.`;
w.share(); $("#tx").value = shareBody; $('#mo [data-k="Hopeful"]').click(); $("#go").click(); await wait(200); $("#y").click(); await until(() => false, 2000);
const posted = (await db.query("SELECT count(*) FROM posts WHERE body=$1", [shareBody])).rows[0].count; ok(posted === "1", "share form saves a post to the database");
// check-in saves to the journal
w.checkin(); $('[data-k="Anxious"]').click(); await wait(300); $("#cj").click(); await wait(1200);
ok(+(await db.query("SELECT count(*) FROM journal_entries WHERE user_id=(SELECT id FROM users WHERE email=$1)", [email])).rows[0].count >= 2, "check-in saves to the private journal");
// notifications and auth modal
await w.notif(); await wait(800); ok(!!md() && md().textContent.includes("Notifications"), "notifications panel opens"); closeTop();
w.authModal(); ok(!!$("#fp"), "sign-in dialog offers forgot password"); closeTop();
w.help(); await wait(800); ok(!!$("#hl") && $("#hl").textContent.length > 5, "Get help now lists resources"); closeTop();
const real = errs.filter(e => !/fonts\.googleapis/.test(e)); ok(real.length === 0, `no browser errors (${real.length}${real.length ? ": " + real.slice(0, 3).join(" | ") : ""})`);
console.log(`\n${pass} passed, ${fail} failed`); w.close(); await db.end(); process.exit(fail ? 1 : 0);

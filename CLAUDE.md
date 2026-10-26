# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Unsaid is an anonymous emotional-support community. People post feelings to a "wall" and get supportive replies, reactions, private chats, a journal and moderation. The app has three parts: Next.js 15 route handlers (`app/api/**`), PostgreSQL accessed through raw SQL with `pg` (no ORM), and a separate WebSocket server (`server/ws.ts`). The README has the feature list, the privacy rules and the "still to do before launch" list. Read it before assuming a feature is production-ready.

## Commands

Needs Node 20.6+ and a local PostgreSQL.

```
npm run setup            # writes .env with fresh secrets, creates the DB, loads the schema (add `-- --demo` for sample posts)
npm run db:init          # load every schema file into an EMPTY database (fails on an existing one); `npm run db:demo` loads demo posts
npm run dev              # Next.js on http://localhost:3000. Use exactly this origin, not 127.0.0.1, or writes fail with "Bad origin"
npm run ws               # realtime server (port WS_PORT, default 4000), in a second terminal
npm run admin -- you@example.com   # promote an existing account to admin
npx tsc --noEmit         # type check (there is no lint script)
npm test                 # unit tests: tsx --test tests/*.test.ts
npx tsx --test --test-name-pattern="crisis" tests/safety.test.ts   # run a single unit test
npm run test:api         # end-to-end API checks (tests/api.mjs)
npm run test:ui          # real public/app.html + api.js + api2.js in jsdom (tests/ui.mjs)
npm run smoke            # quick curl check of the API
```

- `test:api` and `test:ui` are plain scripts, not a test framework. They need `npm run dev` running and a loaded database (`test:api` also needs `npm run ws`). They read `.env` themselves, create real users, and print `ok`/`FAIL` lines.
- `test:ui` waits on conditions (`until(...)`) rather than fixed delays. Keep it that way when adding checks: fixed `wait()`s were the source of its old flakiness.
- Rate limits live in Postgres (`rate_limits` table, `lib/rate.ts`), so they survive restarts and hold across instances. Signup is 5 per hour per IP; `test:api` and `test:ui` clear the table at start, so run them back to back freely. Clear it by hand (`DELETE FROM rate_limits`) if you hit 429s while clicking around.
- Client IPs come from the last `X-Forwarded-For` entry (`clientIp()`), which assumes a proxy in front that appends it. Without one, every client shares the key `local`.
- Don't run `npm run build` while `npm run dev` is running from the same checkout. Both write to `.next` and corrupt it.

## Architecture

**The UI is not React.** `app/page.tsx` only redirects to `/app.html`. The whole front end is the prototype page `public/app.html`, an inline-script single-page app with global state `st`, render functions like `wall()`, `thread()` and `sticker()`, and hardcoded sample `POSTS`. Two scripts loaded after it override those globals to use the real API:
- `public/api.js`: auth, wall, threads and replies, reactions, requests, reports, help.
- `public/api2.js`: messages and realtime, journal, journey, notifications, admin and moderation, profile, uploads, search, push.

New UI in these scripts doesn't use inline `onclick`: it renders `data-*` attributes (`data-qa`, `data-cx`, `data-p`, …) and handles them in the single delegated click listener on `app` near the end of `api2.js`. Follow that, because every inline handler is another thing standing between the app and a CSP without `'unsafe-inline'` (README launch item 4).

The override pattern is `const wall0 = wall; wall = async function () { … api … }`, falling back to `wall0()` (sample data) when the API fails. Real posts are mapped into the prototype's post shape (`{id, who, text, mood, cls, care, re, …}`) and stored in `st.api[id]`. If a UI value looks wrong, check that mapping first, because missing API fields default to placeholders. Also check that something overrides the part of the page at all: anything `app.html` renders from `POSTS` stays sample data unless `api.js`/`api2.js` replaces it. For example, the home "Someone's feeling today" card (`today()`, `#today`) is redrawn by the `wall` override. Real posts leave `care` undefined, and `sticker()` then hides the 💙 count, because reaction counts aren't public. The scripts are minified-style single lines, so search them with grep rather than reading them top to bottom. Each is wrapped in an IIFE with its own helpers, and the same names mean different things: in `api.js`, `me` is the signed-in user object or `null`, while in `api2.js` `me()` is a function that reads `window.__me`.

**Route handlers** are wrapped in `handler()` from `lib/http.ts`. It does a same-origin (CSRF) check on writes against `APP_ORIGIN`, session auth from the `sid` cookie (`lib/session.ts`), suspension blocking, per-user rate limiting and optional `staff: "moderator" | "admin"`. Request bodies are validated with zod. Public endpoints (`/api/wall`, `/api/search`, `GET /api/posts`) skip `handler()` and query directly with `q()` from `lib/db.ts`.

**Privacy invariants enforced in SQL. Keep them when editing queries:**
- Never select `author_id` or other user ids into public responses. Author display is computed in SQL (`CASE p.identity WHEN 'anonymous' THEN 'Anonymous' …`).
- Public content filters on `visibility='public' AND mod_status='approved' AND deleted_at IS NULL`. Comments likewise need `mod_status='approved' AND deleted_at IS NULL`, and counts should use the same filter.
- Reaction counts are intentionally not exposed publicly. `GET /api/posts/[id]/react` and `/save` return only the caller's own reactions and saved state.
- Respect `blocks` in both directions where relevant.
- Minors and adults can't open private chats. This is checked in code (`lib/safety.ts`) and by a database trigger.
- Messages and journal entries are AES-256-GCM encrypted via `seal`/`open` in `lib/crypto.ts`.

**Moderator tooling:** `GET /api/mod/cases/[id]` gives the case subject's history under a pseudonym (`handle()` in `lib/modcase.ts`, an HMAC of the user id), never the raw id. `POST /api/mod/cases/[id]/reveal` decrypts a *reported* conversation for staff: it needs a written reason, only shows messages sent before the report, and writes the reason to the audit log. `SUBJECT` in `lib/modcase.ts` decides who a case is about. For conversations, that's the member who didn't report.

**Age group is locked once confirmed.** `PATCH /api/me` only applies `isMinor` while `age_confirmed` is false (Google sign-ups before onboarding), and silently ignores it after that. Don't loosen this, because it's what stops someone switching groups to get around the teen protections.

**Moderation and safety:** `lib/moderation.ts` (`screen()` → approved/flagged) and `lib/safety.ts` (`assessRisk`, `isHarmfulReply`) are keyword heuristics. Flagged content inserts into `moderation_cases`, and staff actions are written to an append-only audit log (`lib/audit.ts`).

**Realtime:** `server/ws.ts` authenticates the same `sid` session cookie, checks the WebSocket origin against `APP_ORIGIN`, and fans out events through Postgres `LISTEN/NOTIFY`, so it scales across instances.

**Database:** schema changes are numbered SQL files in `db/` (`schema.sql`, then `002_…` through `005_hardening.sql`, then `seed.sql`). There is no migration tool. The file list is hardcoded in both `scripts/db-init.sh` and `scripts/setup.sh`, so add new files to both. Those scripts only build a fresh database. To change an existing one (your local DB, production), run just the new file: `psql "$DATABASE_URL" -f db/00N_….sql`. Note that `docker-compose.yml` mounts `db/` as the Postgres init directory, which runs files alphabetically, so the numbered files run before `schema.sql`.

**Ops:** `POST /api/cron` with `Authorization: Bearer $CRON_SECRET` lifts expired sanctions, prunes sessions, tokens and rate-limit rows, and sends pushes. `lib/db.ts` creates the pool lazily, so `next build` works without `DATABASE_URL` (Vercel collects page data by importing every route). Without `RESEND_API_KEY`, emails are printed to the server log. Uploads go to local disk (`uploads/`) and are only visible after a moderator approves them.

**Brand:** `node brand/make-icons.mjs` regenerates every logo file (`public/logo.svg`, `favicon.svg`, the PWA PNGs, `apple-touch-icon.png`, `brand/logo-1024.png`) from one bubble path. The header mark in `app.html` is the same path inlined so it can use the theme's CSS variables.

## Deployment

`main` on github.com/AchayoEarnest/unsaid deploys to Vercel. Only the Next.js app runs there:
- The realtime server (`server/ws.ts`) and local-disk uploads (`UPLOAD_DIR`) need hosting elsewhere. Without `WS_URL` the UI just skips realtime.
- New `db/` files are not applied automatically. Run them against the production database before or with the deploy, or the routes that use them return 500s.
- `.gitignore` rules need a leading `/` when they mean a top-level folder. The unanchored `uploads/` once silently excluded `app/api/uploads/**` from git, so those routes never deployed. If `git status` doesn't show a file you edited, run `git check-ignore -v <path>`.


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Unsaid is an anonymous emotional-support community. People post feelings to a "wall" and get supportive replies, reactions, private chats, a journal and moderation. The app has three parts: Next.js 15 route handlers (`app/api/**`), PostgreSQL accessed through raw SQL with `pg` (no ORM), and a separate WebSocket server (`server/ws.ts`). The README has the feature list, the privacy rules and the "still to do before launch" list. Read it before assuming a feature is production-ready.

## Commands

Needs Node 20.6+ and a local PostgreSQL.

```
npm run setup            # writes .env with fresh secrets, creates the DB, loads the schema (add `-- --demo` for sample posts)
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
- Signup is rate limited to 5 per hour per IP, and the limiter is in memory (`lib/rate.ts`). Restart `npm run dev` between `test:api` runs.
- Don't run `npm run build` while `npm run dev` is running from the same checkout. Both write to `.next` and corrupt it.

## Architecture

**The UI is not React.** `app/page.tsx` only redirects to `/app.html`. The whole front end is the prototype page `public/app.html`, an inline-script single-page app with global state `st`, render functions like `wall()`, `thread()` and `sticker()`, and hardcoded sample `POSTS`. Two scripts loaded after it override those globals to use the real API:
- `public/api.js`: auth, wall, threads and replies, reactions, requests, reports, help.
- `public/api2.js`: messages and realtime, journal, journey, notifications, admin and moderation, profile, uploads, search, push.

The override pattern is `const wall0 = wall; wall = async function () { … api … }`, falling back to `wall0()` (sample data) when the API fails. Real posts are mapped into the prototype's post shape (`{id, who, text, mood, cls, care, re, …}`) and stored in `st.api[id]`. If a UI value looks wrong, check that mapping first, because missing API fields default to placeholders. The scripts are minified-style single lines, so search them with grep rather than reading them top to bottom.

**Route handlers** are wrapped in `handler()` from `lib/http.ts`. It does a same-origin (CSRF) check on writes against `APP_ORIGIN`, session auth from the `sid` cookie (`lib/session.ts`), suspension blocking, per-user rate limiting and optional `staff: "moderator" | "admin"`. Request bodies are validated with zod. Public endpoints (`/api/wall`, `/api/search`, `GET /api/posts`) skip `handler()` and query directly with `q()` from `lib/db.ts`.

**Privacy invariants enforced in SQL. Keep them when editing queries:**
- Never select `author_id` or other user ids into public responses. Author display is computed in SQL (`CASE p.identity WHEN 'anonymous' THEN 'Anonymous' …`).
- Public content filters on `visibility='public' AND mod_status='approved' AND deleted_at IS NULL`. Comments likewise need `mod_status='approved' AND deleted_at IS NULL`, and counts should use the same filter.
- Reaction counts are intentionally not exposed publicly.
- Respect `blocks` in both directions where relevant.
- Minors and adults can't open private chats. This is checked in code (`lib/safety.ts`) and by a database trigger.
- Messages and journal entries are AES-256-GCM encrypted via `seal`/`open` in `lib/crypto.ts`.

**Moderation and safety:** `lib/moderation.ts` (`screen()` → approved/flagged) and `lib/safety.ts` (`assessRisk`, `isHarmfulReply`) are keyword heuristics. Flagged content inserts into `moderation_cases`, and staff actions are written to an append-only audit log (`lib/audit.ts`).

**Realtime:** `server/ws.ts` authenticates the same `sid` session cookie, checks the WebSocket origin against `APP_ORIGIN`, and fans out events through Postgres `LISTEN/NOTIFY`, so it scales across instances.

**Database:** schema changes are numbered SQL files in `db/` (`schema.sql`, then `002_…`, `003_…`, `004_extras.sql`, then `seed.sql`). There is no migration tool. The file list is hardcoded in both `scripts/db-init.sh` and `scripts/setup.sh`, so add new files to both. Note that `docker-compose.yml` mounts `db/` as the Postgres init directory, which runs files alphabetically, so the numbered files run before `schema.sql`.

**Ops:** `POST /api/cron` with `Authorization: Bearer $CRON_SECRET` lifts expired sanctions, prunes sessions and tokens, and sends pushes. Without `RESEND_API_KEY`, emails are printed to the server log. Uploads go to local disk (`uploads/`) and are only visible after a moderator approves them.

# Unsaid: backend

Next.js route handlers + PostgreSQL + a small WebSocket server. `public/prototype.html` is the front-end design reference.

## What this folder is
A complete Next.js project. `/` loads the UI (`public/app.html`), and two scripts connect it to the real API: `public/api.js` (sign in/up/out, forgot password, wall, posting, thread replies, reactions, private requests, reports, help) and `public/api2.js` (messages with realtime, journal, journey, notifications, admin and moderation, profile and account tools, image upload, search, push). If the API isn't reachable, the wall falls back to sample data.

## Status: tested end to end in a clean environment
Verified here against PostgreSQL 16, a running Next.js dev server and the realtime server, from a fresh
`npm run setup -- --demo`:
- `npx tsc --noEmit`: no errors.
- All SQL files load cleanly, and all 113 queries in the API code prepare against the schema.
- `npm run build`: production build succeeds (don't run this alongside a live `npm run dev` against the
  same checkout — they both write to `.next` and will corrupt each other's build output; use separate
  checkouts/worktrees, or stop `dev` first).
- `npm run test:api`: 86 checks pass (privacy, moderation, case history and audited reveal, teen protection and the age-group lock, encryption, realtime, uploads, deletion).
- `npm run test:ui`: 25 checks pass, repeatedly, against the real UI loaded in a simulated browser (wall,
  threads, every screen, posting, journal, check-in, notifications, help). Two real bugs found and fixed
  while verifying this: the home wall and reaction picker could render stale sample data on a slow
  connection (api.js now renders the real wall as soon as it loads, instead of trusting a hardcoded
  timer), and the community-mood and discover-search screens could get overwritten by a late-arriving
  response for a screen you'd already left. `scripts/make-admin.sh` also used to report success even for
  an email with no account; it now checks first and exits non-zero when there's nothing to promote.
- `npm test`: 6 unit tests pass.

Not covered: a real browser on a real phone, Google sign-in (needs your Google keys), real email sending, push delivery, S3 storage, load, and a security review.

## Quick start
Needs Node 20.6+ and PostgreSQL running locally (macOS: `brew install postgresql@16 && brew services start postgresql@16`).
```
npm install
npm run setup            # creates .env with fresh secrets, creates the database, loads the schema
npm run setup -- --demo  # optional: also adds demo posts (only needed once)
npm run dev              # app on http://localhost:3000
npm run ws               # realtime, in a second terminal
```
Sign up in the app, then make yourself an admin: `npm run admin -- you@example.com`. Check the API with `npm run smoke`.

If you see `database "<your name>" does not exist`, there is no `.env` yet: run `npm run setup`. Open the app at exactly `http://localhost:3000` (not 127.0.0.1) or sign-in will say "Bad origin".

## Included
- **Database:** `db/schema.sql`, `002_sessions.sql`, `003_age_confirmed.sql`, `seed.sql` (teen guard trigger, append-only audit log, help resources by country).
- **Auth and profile:** email/password and Google sign-in, sessions, logout, privacy settings (`app/api/auth/*`, `app/api/me`).
- **Content:** posts, random wall, search, comments, reactions, saves, "helpful" marks.
- **Moderation:** reports, review queue, case actions (approve, remove, warn, restrict, suspend), all written to the audit log.
- **Private connection:** requests, accept/decline/block, encrypted messages, realtime via `server/ws.ts`.
- **Personal:** journal, journey summary, notifications.
- **Public and admin:** help resources, community mood, admin stats.
- **Delivery:** PWA manifest and service worker, security headers, Dockerfile, docker-compose.

## Privacy rules built in
- Public responses never include `author_id`, and users never see each other's ids. Requests and blocks go through posts and conversations.
- Messages and journal entries are AES-256-GCM encrypted. Safety alerts store only a pointer, never text.
- Moderators see reported posts and comments only. Message text is not in the queue.
- Under-18 and adult accounts can't start private requests, in code and in a database trigger. Google sign-ups start as minors until age is confirmed.
- Community mood hides any bucket under 10 posts.

## Account and operations features
- Email verification and password reset (`/api/auth/verify`, `/api/auth/reset`). Without `RESEND_API_KEY`, emails are printed to the server log.
- Data export and account deletion (`/api/me/export`, `/api/me/delete`).
- Image upload with file-type checks; images are visible to others only after a moderator approves them (`/api/uploads`, `/api/mod/uploads`). Local disk storage; swap for S3/R2 in production.
- Web push with generic payloads (`/api/push`) and a maintenance job at `POST /api/cron` (header `Authorization: Bearer $CRON_SECRET`) that lifts expired sanctions, clears old sessions/tokens and sends pushes. Run it every few minutes. Generate VAPID keys with `npx web-push generate-vapid-keys`.

## Still to do before launch
1. **Run and fix.** None of the API, SQL or UI wiring has been run end to end. Install, `npx tsc --noEmit`, `npm run db:init`, then click through every screen.
2. Replace the keyword checks in `lib/safety.ts` and `lib/moderation.ts` with a real classifier plus trained human review.
3. Rebuild the UI as native React/shadcn components if you want that stack; the current UI is the prototype page connected by scripts.
4. Tighten the CSP: `script-src` still needs `'unsafe-inline'` because `app.html` uses ~60 inline `onclick` handlers (and api.js/api2.js render more). Removing them is part of the React rebuild in item 3. Rate limiting now lives in Postgres, so it already works across instances. Get a security and child-safety review.
5. Verify every help-line number in `db/seed.sql` with its provider.
6. Moderator tooling: a pseudonymous history view and an audited, reason-required flow for reading a reported conversation are in. Still worth adding: a second-person sign-off for reveals, and handling for safety alerts (they're counted but there's no screen to work through them).

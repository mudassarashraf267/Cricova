# Cricova

Cricket scoring and management app. Web app (installable PWA, works offline) on top of a pure-TypeScript scoring engine.

## Run it
```
npm install
npm run dev        # http://localhost:5173
npm test           # engine, API and app-logic tests
npm run e2e        # browser tests incl. two-device sync (starts a throwaway API) (first time: npx playwright install chromium)
npm run build      # production build in apps/web/dist
npm run dev:api    # backend on http://localhost:3001 (the web dev server proxies /api and /auth to it)
```
First launch loads sample teams, players, a tournament and 4 completed matches (Settings -> reset / delete all).

## What works
Dashboard and global search; players (CRUD, photo, career stats); teams (squad, captain/keeper, compare); match wizard (10 formats, custom rules, XI, toss);
ball-by-ball live scoring (wides, no-balls, byes, leg-byes, combined events, wickets of every type, retire/timed out, penalty, declare, free hit, undo/redo,
edit/delete with reason and audit trail, reduced overs); quick-score mode (labelled manual); scorecards, FOW, partnerships, over summaries;
analytics charts; player comparison with filters; tournaments (fixtures, points table, NRR, leaders); CSV and print-to-PDF reports; JSON backup/restore; dark/light.

## Not built yet (see docs/ARCHITECTURE.md)
DLS, Postgres, field-level merge of simultaneous edits, Capacitor/Tauri packaging. Data lives in this browser only.

## Backend (apps/api) and sync
Fastify + built-in SQLite (Node 22.5+). Optional: the app works fully offline without it.
```
npm run build && npm run start -w @cricketpro/api   # serves the API and the built web app on http://localhost:3001
```
Env: `PORT` (3001), `DB_FILE` (cricketpro.sqlite), `WEB_DIR` (apps/web/dist), `JWT_SECRET` (default: generated once and stored in the DB), `AUTH=off` (no login; trusted LAN only).

**First run:** open Settings -> Server sync, enter the server address (blank if the app is served by the API), create the admin account, then choose to upload this device's data or use the server's.
**Roles:** admin (manages accounts, restore), scorer (reads and writes), viewer (read-only). Passwords are scrypt-hashed, tokens are HMAC-signed, failed logins are throttled.
**How sync works:** the browser stays the working copy. Each changed document (player, team, tournament, match) is queued and pushed when online; other devices are notified over Server-Sent Events and pull only what changed. Conflict rule is last write wins per document, so two scorers should not score the *same match* at once. The event stream takes the token in its URL (EventSource cannot set headers); use HTTPS if you expose the server beyond your LAN.

API: `GET/POST /api/{players,teams,tournaments,matches}`, `GET/PUT/DELETE /api/<collection>/:id`, `POST /api/matches/:id/innings/:i/events` (engine-validated, idempotent), `GET/PUT /api/db`, `GET /api/stream`, `/api/users`, `/auth/{status,setup,login,me}`, `/health`.

# Genuine Business — Manual Transaction Tracker

Manual P2P bookkeeping ledger. No money moves here — purely visual record-keeping.
**Username is chosen by the user; password is generated randomly by the system** (shown once at signup, changeable in Account → Change password).

## Features
- **Market board** — members post lots: *open to sell* (have a lot, want a partner) or *open to buy*
  (want a lot, seek a partner), per tier with an optional note. Filter by side/tier, express interest
  (the poster is notified), then pair.
- **Manual pairing** — paste a partner's wallet text (exchanged off-app) → see their profile →
  send a pairing request. One wallet text belongs to exactly one member.
- **Two-sided diary** — every record moves Address shared → Awaiting confirmation → Completed,
  with record IDs, timestamps, partner, tier and status; JSON export included.
- **Loyalty coins (1 coin = 1 USDT, internal points)** — anyone runs a scheme (name + daily coins per
  member); others join and tap Collect each day (up to 7 days backlog). Lots can be priced in a
  scheme's coins: the buyer must hold enough, coins move buyer → seller on acknowledge, the lot
  auto-closes, and every movement lands in the coin history. Record-only lots need no coins.
- **Inbox** — pairing requests, interest notes and completion confirmations, with per-record
  acknowledge forms (receiver picks the verified amount).
- **Admin console** — members, all records, force-complete, block/unblock.
- **PWA, mobile-first** — bottom tab bar, 44px+ touch targets, 16px inputs (no iOS zoom),
  safe-area support, installable, offline app shell. API responses are never cached.

## The standard flow (money moves off-app, records live here)
1. **Discover** — browse Market, or agree directly with someone you know.
2. **Agree off-app** — settle tier and details over WhatsApp / in person. Money moves here, outside the app.
3. **Exchange addresses off-app** — partners share public wallet *text* (never a connection, never inside the app).
4. **Record** — paste their wallet text in Find your partner, confirm the profile, send the request.
5. **Verify off-app** — the receiver checks their own wallet independently.
6. **Acknowledge** — the receiver confirms the exact amount in their inbox → both ledgers turn Completed.
7. **Keep the diary** — filter the ledger, export JSON, dispute via admin if needed.

## Admin dashboard
- Fixed admin username: `admin` (reserved — members can't register it).
- Create it in production once:
  `MONGODB_URI="..." MONGODB_DB="ledgerbook_p2p" ADMIN_PASSWORD="..." node scripts/seed-admin.mjs`
  then log in as `admin` and change the password under Account → Security.
- An **Admin** tab appears for the admin: circle stats, full member list (search, block/unblock —
  blocked accounts can't log in or act), all pairing records (filter, search, force-complete stuck
  Pending entries — both sides get notified).

## Stack
- Frontend: React + Vite + Tailwind (PWA, `public/manifest.webmanifest` + `public/sw.js`)
- Backend: Vercel serverless (`/api/*`) + MongoDB (`users`, `txns`, `notifs`, `copylogs`)
- Offline fallback: localStorage mirror with the same product rules (dev + PWA offline shell)

## Env vars (Vercel → Project → Settings → Environment Variables, plus `.env` locally)
```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=ledgerbook_p2p
JWT_SECRET=<long-random-string>
```

## Git — first push
```bash
git init
git add -A
git commit -m "LedgerBook P2P: MongoDB + system-generated passwords"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## Vercel deploy
1. `vercel` (or Import the git repo in the Vercel dashboard)
2. Add the 3 env vars above
3. Deploy. API routes live at `/api/*`, health check at `/api/health`

## Local dev
- `npm install`
- Plain frontend only: `npm run dev` (uses offline fallback — demo logins shown on the auth screen)
- Full stack (needs `.env`): `vercel dev`
- `npm run build` / `npm run preview`

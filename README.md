# Genuine Business — Manual Transaction Tracker

Manual P2P bookkeeping ledger. No money moves here — purely visual record-keeping.
**Username is chosen by the user; password is generated randomly by the system** (shown once at signup, changeable in Account → Change password).

## Features
- **Market board** — pairing lots (open to sell / open to buy per tier) and **redeem lots**
  (members sell their coins openly), plus **direct buyout requests** to a specific user by username.
- **Tiered coin schemes** — any member runs a scheme on a tier (entry price = tier amount,
  e.g. Bronze = 150). Others buy in: they pay the owner off-app, the owner approves here,
  and they earn daily coins. One coin = 1 USDT, internal points only.
- **Owner approvals** — scheme buys and coin trades both go through manual approve/decline
  by the counterparty after off-app settlement; every decision is written to the diary.
- **Admin one-click distribution** — the daily coin run credits every member of every scheme
  (per-scheme math shown, already-run schemes skipped). Members see "today's coins deposited".
- **Manual pairing** — paste a partner's wallet text (exchanged off-app) → see their profile →
  send a pairing request. One wallet text belongs to exactly one member.
- **Two-sided diary** — pairing records, scheme entries and coin trades, each with IDs,
  timestamps, parties and status; JSON export included.
- **Redeem market (sell-side only)** — members redeem by selling coins openly on the board,
  or by sending a direct buyout request to a specific user. The counterparty approves after
  off-app settlement; coins move and the trade is recorded. Pairing lots can also be coin-priced.
- **Inbox** — pairing requests, buy/approval proposals, interest notes and completion
  confirmations, with per-record acknowledge forms (receiver picks the verified amount).
- **Admin console** — members, all records, force-complete, block/unblock.
- **PWA, mobile-first** — bottom tab bar, 44px+ touch targets, 16px inputs (no iOS zoom),
  safe-area support, installable, offline app shell. API responses are never cached.

## The standard flow (money moves off-app, records live here)
1. **Discover** — browse Market lots/schemes, or deal with someone you know.
2. **Agree + pay off-app** — tier, price and wallet details settled over WhatsApp / in person.
   Money (including scheme entries and coin purchases) moves here, outside the app.
3. **Exchange addresses off-app** — partners share public wallet *text* (never a connection).
4. **Request + approve** — buyer requests here (scheme buy or coin trade); the owner approves
   after confirming off-app payment. Approval moves coins / grants membership and writes the record.
5. **Daily coins** — admin runs the one-click distribution; members see today's deposit in inbox + wallet.
6. **Redeem** — sell coins openly via a coin lot, or request a specific user to buy; approve on settlement.
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

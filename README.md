# LedgerBook P2P — Manual Transaction Tracker

Manual P2P bookkeeping ledger. No money moves here — purely visual record-keeping.
**Username is chosen by the user; password is generated randomly by the system** (shown once at signup, changeable in Account → Change password).

## How pairing works (manual — no auto-matching)
1. Two members agree on a tier **outside the app** (WhatsApp, in person, …) and share the public wallet text.
2. The sender pastes that wallet text into Tiers & Pairing → the app resolves it to a member profile (`POST /api/partner/lookup`).
3. The sender confirms the profile and sends a pairing request (`POST /api/deposit { planId, targetWallet }`) — one wallet text belongs to exactly one member.
4. The partner gets an inbox note and acknowledges after verifying offline → status flips to Completed.

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

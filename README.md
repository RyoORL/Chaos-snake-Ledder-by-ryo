# Snake & Chaos 🐍🪜

Online multiplayer Snakes & Ladders with loot boxes and items. Server-authoritative (Node + Socket.IO); static frontend.

```
frontend/  index.html (UI+client logic), config.js (backend URL)   → GitHub Pages
backend/   server.js (sockets), game/game.js (rules, items, boxes) → Render/Railway/Fly
```

## Run locally
```bash
cd backend && npm install && npm start      # port 3000
cd ../frontend && npx serve .                 # or: python3 -m http.server 8080
```
Open the frontend in two browser tabs (or two phones on your LAN — then set the LAN IP in `config.js`).

## GitHub
1. Create a new empty repo at github.com/new (e.g. `snake-and-chaos`).
2. In this folder: `git init && git add . && git commit -m "Initial commit" && git branch -M main && git remote add origin https://github.com/YOU/snake-and-chaos.git && git push -u origin main`

## Deploy backend (Render example, free tier)
1. render.com → New → Web Service → connect the repo.
2. Root directory `backend`, build `npm install`, start `npm start`.
3. Env var `ALLOWED_ORIGINS` = `https://YOU.github.io` (no secrets are needed).
4. Copy the URL (https://xxx.onrender.com) — HTTPS means secure WebSockets automatically.

## Deploy frontend (GitHub Pages)
1. Edit `frontend/config.js`: set `PRODUCTION_SERVER` to your backend URL, commit, push.
2. Pages only serves the repo root or `/docs`: rename `frontend` → `docs` (or use a Pages deploy action), then Settings → Pages → Branch `main`, folder `/docs`.
3. Open `https://YOU.github.io/snake-and-chaos/`.

## Troubleshooting
- **"connecting" forever**: wrong `PRODUCTION_SERVER`, or the free backend is asleep (wait ~30s and reload).
- **CORS error in console**: `ALLOWED_ORIGINS` must exactly match the Pages origin (no path, no trailing slash).
- **Mixed content blocked**: backend URL must be `https://`.
- **Can't join**: room code is wrong, room is full (6), or the match already started.

## Rules summary
Items: Rocket +5, Shield (auto-blocks one negative effect), Bomb −3, Freeze, Swap, Precision Dice, Magnet, Lucky Charm +2, Trap (placed on your current square, −4 for the next opponent). Drop weights sum to 100. Max 3 items; if full, replace or leave. Boxes spawn every 5–8s (max 6) and are collected only by landing on them. Overshooting 100 still wins.

## Status
Code was written and syntax-checked but **not yet deployed or tested on real devices**. Run the checklist from the spec yourself before sharing.

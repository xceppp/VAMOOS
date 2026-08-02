# VAMOOS — Livescores + Goal Alerts

Live football scores, late-game predictions, favorites, and goal alerts — in **English & Arabic**.

## Quick start

```bash
npm install
npm run dev
```

- App: http://localhost:5173  
- API / WebSocket: http://localhost:3001 (`/ws`)

## Language

Use the **العربية / English** button in the top bar. Arabic switches the whole UI to RTL.

## Ads / revenue (Google AdSense)

Ad slots are already placed (top banner + in-feed). To earn:

1. Apply at [Google AdSense](https://www.google.com/adsense/) with your public site URL  
2. Create ad units (banner + in-article/in-feed)  
3. Copy `apps/web/.env.example` → `apps/web/.env.local` and fill:

```env
VITE_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx
VITE_ADSENSE_SLOT_BANNER=1234567890
VITE_ADSENSE_SLOT_INFEED=1234567891
```

4. Restart the web app. Placeholders disappear once IDs are set.

Until AdSense approves you, placeholders keep the layout ready.

## How to use

1. Open **Live** and star matches you care about  
2. Tap **Enable goal alerts** once  
3. Goals play a **stadium cheer** (or your uploaded song on **Notify**)  
4. Check **Predictions** for last-15′ tips  

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | API + web together |
| `npm run build` | Build both apps + copy web UI into the server |
| `npm run start` | Host built web + API on one port |
| `npm run mobile:android` | Capacitor Android |

## Deploy (Render / Railway / Docker)

Use **one** web service from the repo root:

- **Build:** `npm ci && npm run build`
- **Start:** `npm start`
- **Port:** use the host `PORT` env (already supported)

If you open the site and see `Cannot GET /`, the build step did not produce the web UI — fix the Build command above (not only `npm start`).

See `MOBILE.md` for phone install.

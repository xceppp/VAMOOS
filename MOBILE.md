# Install VAMOOS on iPhone / Android

You have **two paths**. Pick what you need.

## 1) Fastest — Install as app (PWA)

Works on **Android** and **iPhone** without Android Studio / Xcode.

1. On your PC:

```bash
npm run build
npm run start
```

2. Find your PC’s LAN IP (example `192.168.1.20`):
   - Windows: `ipconfig` → IPv4 Address
3. On your phone (same Wi‑Fi), open:

`http://YOUR_PC_IP:3001`

4. Install:
   - **Android (Chrome):** menu → **Install app** / **Add to Home screen**
   - **iPhone (Safari):** Share → **Add to Home Screen**

That gives you a full-screen VAMOOS icon like an app.

> Live scores still need the PC server running (or a real hosted server later).

---

## 2) Real Android APK (Capacitor)

Needs **Android Studio** on this Windows PC.

```bash
cd apps/web
npm run build
npx cap add android          # first time only
npx cap sync
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. Install the APK on your phone

### Point the APK at your server

Create `apps/web/.env.production.local`:

```env
VITE_API_URL=http://YOUR_PC_IP:3001
VITE_WS_URL=ws://YOUR_PC_IP:3001/ws
```

Then rebuild + sync:

```bash
npm run mobile:sync
```

Your phone and PC must be on the same Wi‑Fi, and Windows Firewall must allow port **3001**.

---

## 3) iOS app (App Store / TestFlight)

Building a native **.ipa** requires a **Mac + Xcode** (+ Apple Developer account for device install / TestFlight).

On a Mac:

```bash
cd apps/web
npm run build
npx cap add ios              # first time only
npx cap sync
npx cap open ios
```

Then run on a simulator/device from Xcode.

On Windows you **cannot** compile the iOS binary. Use the **PWA Add to Home Screen** path on iPhone until you have a Mac.

---

## What was added in the project

- PWA manifest + service worker (`vite-plugin-pwa`)
- Capacitor config (`apps/web/capacitor.config.ts`) app id `com.vamoos.livescores`
- Mobile-safe API/WebSocket URL helper (`VITE_API_URL` / `VITE_WS_URL`)
- Server listens on `0.0.0.0` and can serve the built web app for phone install

## Useful scripts

| Command | Purpose |
|---------|---------|
| `npm run build && npm run start` | Host installable PWA + API |
| `npm run mobile:sync` | Build web + sync into native projects |
| `npm run mobile:android` | Sync + open Android Studio |
| `npm run mobile:ios` | Sync + open Xcode (Mac only) |

# Slice 1 Smoke Test — Login → OTP → Profile

## 1. Backend env setup

Copy `.env.example` to `.env.local` inside `apps/backend/` and set:

```
DATABASE_URL=<your Railway Postgres URL>
JWT_SECRET=<any long random string for dev>
AXHY_OTP_BYPASS=1
```

See `apps/backend/.env.example` for all required keys. `AXHY_OTP_BYPASS=1` skips MSG91 — any phone accepts code `123456`.

## 2. Start backend

```bash
cd apps/backend
pnpm dev
```

Backend listens on `http://localhost:4000`. Confirm with `curl http://localhost:4000/health`.

## 3. Find your LAN IP

```bash
ipconfig getifaddr en0
```

Use this IP so Expo Go on your phone can reach the backend.

## 4. Start mobile

```bash
cd apps/mobile
EXPO_PUBLIC_API_BASE_URL=http://<lan-ip>:4000 pnpm dev
```

Scan the QR code in Expo Go. The app opens on the phone screen.

## 5. Manual smoke test (4 steps)

1. Enter any 10-digit number (e.g. `9876543210`) and tap **Get OTP**.
2. The OTP screen appears showing a masked phone number.
3. Enter `123456` and tap **Verify**.
4. Profile screen loads showing **Namaste, {name}.** and company + role.

## 6. Sign out and re-test

On the Profile screen, tap **Sign out**. You land back on the phone screen. Repeat from step 1.

## 7. Known limitations (Slice 1)

- Chat, Today, Summary, Updates tabs show "Coming soon — Slice 2+".
- No refresh-token auto-rotation: 401 kicks user back to sign-in.
- No Maestro/Detox tests — deferred to Slice 2.
- iOS only — no Android optimization.

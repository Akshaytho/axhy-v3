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

## 5. Seed the sandbox tenant (first run only)

```bash
cd apps/backend
pnpm exec tsx --env-file=.env.local scripts/seed-sandbox.ts
```

This creates Company `axhy-sandbox` + User `+919999999999` + Membership(SUPERVISOR). Idempotent — safe to re-run.

## 6. Manual smoke test (4 steps)

1. Enter `9999999999` (the seeded sandbox phone) and tap **Get OTP**.
2. The OTP screen appears showing a masked phone number.
3. Enter `123456` and tap **Verify**.
4. Profile screen loads showing **Namaste, Akshay (sandbox).** and company `Axhy Sandbox` + role `SUPERVISOR`.

**Note:** Any other 10-digit number will produce a `403 NO_MEMBERSHIPS` error — only seeded phones can sign in. Add additional test users by editing `seed-sandbox.ts`.

## 7. Sign out and re-test

On the Profile screen, tap **Sign out**. You land back on the phone screen. Repeat from step 1.

## 8. Known limitations (Slice 1)

- Chat, Today, Summary, Updates tabs show "Coming soon — Slice 2+".
- No refresh-token auto-rotation: 401 kicks user back to sign-in.
- No Maestro/Detox tests — deferred to Slice 2.
- iOS only — no Android optimization.

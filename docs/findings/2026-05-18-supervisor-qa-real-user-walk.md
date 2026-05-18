# Supervisor app — real-user Playwright walk findings (2026-05-18)

**Walker:** Real-user simulation (Playwright iPhone 13 Mini, touch-driven). No API shortcuts, no token injection, no URL `page.goto` for tab/drawer navigation. Login via phone-input + OTP-input UI; navigation via tab-bar taps + hamburger ≡ + drawer-entry taps.

**Web URL:** http://172.20.10.6:8081
**API URL:** http://172.20.10.6:4000

## Summary

- P0: 1
- P1: 0
- P2: 0

## Findings

### RUW-01 [P0] — Drawer entry "My sites" not tappable

- **Step:** G-sites
- **Expected:** A drawer item labeled "My sites" is tappable
- **Actual:** no locator strategy found "My sites"
- **Evidence:** G-drawer/07-drawer-open.png

## Walk log (chronological)

```
[step A] open http://172.20.10.6:8081
[OK] cold-open landed on phone-OTP "Sign in" screen
[step B] type phone digits
[OK] typed phone digits into UI input
[step C] tap Get OTP
[OK] tapped Get OTP button
[step D] type OTP code
[OK] navigated to OTP screen
[OK] typed OTP 123456 into UI
[OK] tapped Verify button
[step E] post-login landing
[OK] post-login landed on Today
[step F] tap tab "Decisions"
[OK] tab "Decisions" rendered after UI tap
[step F] tap tab "Activity"
[OK] tab "Activity" rendered after UI tap
[step F] tap tab "Chat"
[OK] tab "Chat" rendered after UI tap
[step G] return to Today, then open drawer
[OK] tapped hamburger ≡ menu
[OK] all 7 drawer entries visible
[step G] tap drawer entry "My profile"
[OK] drawer entry "My profile" navigated correctly
[step G] tap drawer entry "My sites"
[FINDING RUW-01] (P0) Drawer entry "My sites" not tappable — no locator strategy found "My sites"
[step H] open Chat tab + verify input affordances
[OK] Chat tab capture surface visible
```

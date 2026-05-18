# Supervisor app — real-user Playwright walk findings (2026-05-18)

**Walker:** Real-user simulation (Playwright iPhone 13 Mini, touch-driven). No API shortcuts, no token injection, no URL `page.goto` for tab/drawer navigation. Login via phone-input + OTP-input UI; navigation via tab-bar taps + hamburger ≡ + drawer-entry taps.

**Web URL:** http://172.20.10.6:8081
**API URL:** http://172.20.10.6:4000

## Summary

- P0: 6
- P1: 1
- P2: 0

## Findings

### RUW-01 [P0] — Post-login did not land on Today tab

- **Step:** E-today
- **Expected:** Today tab visible with weekday eyebrow
- **Actual:** body text: Today never appeared
- **Evidence:** D-otp/05-after-verify.png

### RUW-02 [P0] — Drawer entry "My sites" not tappable

- **Step:** G-sites
- **Expected:** A drawer item labeled "My sites" is tappable
- **Actual:** no locator strategy found "My sites"
- **Evidence:** G-drawer/07-drawer-open.png

### RUW-03 [P0] — Drawer entry "Memory & rules" not tappable

- **Step:** G-memory
- **Expected:** A drawer item labeled "Memory & rules" is tappable
- **Actual:** no locator strategy found "Memory & rules"
- **Evidence:** G-drawer/07-drawer-open.png

### RUW-04 [P0] — Drawer entry "Notifications" not tappable

- **Step:** G-notifications
- **Expected:** A drawer item labeled "Notifications" is tappable
- **Actual:** no locator strategy found "Notifications"
- **Evidence:** G-drawer/07-drawer-open.png

### RUW-05 [P0] — Drawer entry "How to use Axhy" not tappable

- **Step:** G-howto
- **Expected:** A drawer item labeled "How to use Axhy" is tappable
- **Actual:** no locator strategy found "How to use Axhy"
- **Evidence:** G-drawer/07-drawer-open.png

### RUW-06 [P0] — Drawer entry "Temporary mode" not tappable

- **Step:** G-temp
- **Expected:** A drawer item labeled "Temporary mode" is tappable
- **Actual:** no locator strategy found "Temporary mode"
- **Evidence:** G-drawer/07-drawer-open.png

### RUW-07 [P1] — Could not navigate to Chat tab

- **Step:** H-chat
- **Expected:** Chat tab is tappable from any other tab
- **Actual:** no locator strategy found "Chat"
- **Evidence:** (no screenshot)

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
[FINDING RUW-01] (P0) Post-login did not land on Today tab — body text: Today never appeared
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
[FINDING RUW-02] (P0) Drawer entry "My sites" not tappable — no locator strategy found "My sites"
[step G] tap drawer entry "Memory & rules"
[FINDING RUW-03] (P0) Drawer entry "Memory & rules" not tappable — no locator strategy found "Memory & rules"
[step G] tap drawer entry "Language"
[OK] drawer entry "Language" navigated correctly
[step G] tap drawer entry "Notifications"
[FINDING RUW-04] (P0) Drawer entry "Notifications" not tappable — no locator strategy found "Notifications"
[step G] tap drawer entry "How to use Axhy"
[FINDING RUW-05] (P0) Drawer entry "How to use Axhy" not tappable — no locator strategy found "How to use Axhy"
[step G] tap drawer entry "Temporary mode"
[FINDING RUW-06] (P0) Drawer entry "Temporary mode" not tappable — no locator strategy found "Temporary mode"
[step H] open Chat tab + verify input affordances
[FINDING RUW-07] (P1) Could not navigate to Chat tab — no locator strategy found "Chat"
```

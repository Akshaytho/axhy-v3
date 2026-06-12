# Marketing Website — Complete UI Design Brief

**Date:** 2026-06-12 · **Status:** Ready for design (founder picks direction in §4) · **Property:** `axhy.app` (public)
**Rule zero:** this is a NEW site. Nothing from the current admin-web pages (nav, footer, hero, cards) is reference material. Fresh thinking only.

This brief is written so a designer can deliver **100% complete UI designs without asking a single product question.** Every page, section, component, and state is specified. What is NOT specified (and is the designer's craft): exact layout geometry, imagery composition, and micro-detailing inside the chosen direction.

---

## 1. What AXHY is (product truth — read first)

AXHY runs the daily work of cleaning companies in India and **proves the work actually happened**.

The loop (this is the heart of every page):

1. A worker reaches the site and scans the site's QR code.
2. Takes **before photos** of the area.
3. Does the work. Timer runs.
4. Takes **after photos**.
5. **AI compares the photos and checks the work is real.** Staged or copied photos get FLAGGED, not approved.
6. The supervisor sees flags the same minute and decides — with the AI's plain-words reason in front of them.
7. Every step lands in a permanent record nobody can edit or delete — not even us.

Around the loop: attendance, leave, shift swaps, complaints, salary-month records, an AI chat where a supervisor can just say "Mukesh ko aaj absent karo" and it happens — with rules checked, in three languages (English, हिन्दी, తెలుగు).

**What makes it different (the only three things the site must land):**

- **Proof, not reports.** Photos + AI check + permanent record. An owner doesn't have to trust anyone's word.
- **Built for the people who actually use it.** Workers with low literacy get big buttons, photos, voice — no typing, no English. Supervisors talk to it like a person.
- **Indian to the bone.** WhatsApp login, Hinglish chat, ₹ pricing, DPDP-compliant records.

## 2. Audience and the one job of the site

**Primary reader:** the owner of a cleaning/facility company (50–2,000 workers). Reads on a phone, probably at night, tired of WhatsApp groups full of "done ✅" messages he can't trust. Not technical. Skims.
**Secondary:** ops heads and HR managers evaluating for the owner.
**The one job:** make the owner think _"this would show me the truth without 100 phone calls"_ — and tap the WhatsApp button.
**The real competitor** is not other software. It is **WhatsApp groups + Excel + trust**. The site should name that world, not "legacy solutions."

## 3. Voice and honesty rules (binding on copy AND design)

- Plain words a 10th-class student understands. Short sentences. Say "the app", "photos", "salary" — never "solution", "empower", "streamline", "leverage", "seamless".
- Hinglish is welcome inside product screenshots and example chats. It is proof of who we built this for.
- **No fake anything:** no invented testimonials, no logo walls, no "trusted by 500+ companies", no made-up stats. We are pre-launch. Strength comes from showing the real product doing the real thing.
- Numbers shown must be real and labeled (e.g. "₹8 per verified visit" — real; "saves 40% time" — banned until measured).
- Every claim must be demonstrable inside the product screenshots on the same page.

## 4. Visual direction — three options (founder picks ONE; everything inherits)

> All three: light mode only at launch, Lucide icon set (one stroke width, no emoji-as-icons), real device frames for product shots, 4/8px spacing rhythm, WCAG AA.

### Option A — "Warm Proof" (recommended)

The product app already greets people with "Namaste" on warm cream. The website carries that same warmth outward — it looks Indian, human, and calm, not Silicon-Valley-cold. Trust comes from warmth + evidence.

- **Style:** warm minimalism; cream paper surfaces, generous whitespace, soft 1px borders, almost no shadows; photography and product shots do the talking.
- **Palette:** background `#FFFBEB` (warm cream) · foreground `#0F172A` · primary/CTA terracotta `#9A3412` (hover `#C2410C`) · verified-green accent `#059669` (used ONLY for "verified/proof" moments) · flag-amber `#D97706` (only for "flagged" moments) · muted `#F8F2F0` · border `#F2E6E2`.
- **Type:** **Calistoga** (display; heroes and section heads only, 36–56px, line-height 1.1) + **Inter** (body/UI 16–18px, 400–600) + **JetBrains Mono** (12px uppercase tracked labels: section badges, data chips like "VISIT #4521 · VERIFIED").
- **Feel cues:** the green "verified" tick and amber "flagged" chip become the site's signature motif — proof states as visual language.

### Option B — "Trust & Authority"

Bank-grade seriousness. For a buyer who wants to see an institution.

- **Style:** trust-and-authority editorial; white/very-light-slate surfaces, strong navy, metric-led sections, certificate/credential styling.
- **Palette:** background `#F8FAFC` · foreground `#020617` · primary `#0F172A` · CTA blue `#0369A1` · muted `#E8ECF1` · border `#E2E8F0`.
- **Type:** Calistoga or a strong serif display + Inter body + JetBrains Mono data labels.
- **Risk to weigh:** reads "corporate"; can feel distant from the worker-on-the-floor reality that is our actual strength.

### Option C — "Bold Statement"

Type-as-hero manifesto. For standing out loudly in a boring category.

- **Style:** poster typography; near-black ink on off-white, one accent; huge headline statements ("WhatsApp groups are not proof."); product shots large and raw.
- **Palette:** background `#FAFAFA` · ink `#18181B` · one accent: vermillion `#C2410C` · border `#E4E4E7`.
- **Type:** Inter 600–800 everywhere (hero 72px, -1.5px tracking), Playfair Display _italic_ only for one pull-quote per page, JetBrains Mono labels. 5:1 hero-to-body size ratio.
- **Risk to weigh:** demands very disciplined copy; weak lines look pretentious in this direction.

**Anti-patterns for ALL options (from design intelligence + our rules):** AI purple/pink gradients · glassmorphism · playful cartoon illustration · western stock-office photos · emoji as icons · dark-mode-first · fake badges.

## 5. Sitemap (10 pages)

```
/                  Home (the persuasion page — deepest spec, §6)
/how-it-works      The proof loop, step by step
/for-owners        Persona page
/for-supervisors   Persona page
/for-workers       Persona page
/pricing           ₹8/visit + ₹2,000/month floor
/about             Why we built this (founder story, plain words)
/demo              Book a demo (WhatsApp-first) — also a section on every page
/help              Product help (replaces axhy.app/help target that the apps already link to — KEEP this URL)
/privacy, /terms   Legal (DPDP-aware privacy page)
```

Global: 404 page (helpful, links home), language switcher stub (EN live; हिन्दी/తెలుగు marked "coming soon" honestly).

## 6. Page-by-page specification

### 6.1 Home `/` — section by section

1. **Nav (sticky, slim):** logo · How it works · Who it's for (dropdown: owners/supervisors/workers) · Pricing · About · [WhatsApp Demo CTA — primary button]. Mobile: sheet menu, CTA stays visible.
2. **Hero:** H1 (direction-toned, e.g. "Every visit proven. Not promised.") · one subline ("Workers photo their work. AI checks it. You see the truth — without 100 phone calls.") · primary CTA "Talk to us on WhatsApp" + secondary "See how it works ↓" · hero visual = real phone frame showing the supervisor Today screen with one FLAGGED visit (our moat in one image). No abstract illustration.
3. **The problem (name their world):** three short cards — "WhatsApp groups full of 'done ✅'" / "Registers anyone can edit" / "You find out a site was skipped when the client calls". Plain, a little uncomfortable, zero jargon.
4. **The proof loop:** horizontal (mobile: vertical) 5-step timeline — QR scan → before photos → after photos → AI check → supervisor decides. Each step has a real cropped product shot. The AI step shows a REAL flag reason: _"before and after photos look nearly identical — please verify the lobby floor was actually mopped."_ This exact honesty is the conversion moment.
5. **Verified vs Flagged (signature motif):** side-by-side cards — a verified visit (green tick, photos, time) vs a flagged one (amber, AI reason). Caption: "The AI is not polite. It flags what it cannot verify."
6. **For the three people (persona row):** owner / supervisor / worker cards, one sentence + one product shot each, linking to persona pages.
7. **The permanent record:** one section on the immutable trail — "Every visit, every decision, every change — written in ink, not pencil. DPDP-compliant." (No tech words like 'audit log' in the headline.)
8. **Languages & WhatsApp:** chips for English/हिन्दी/తెలుగు · "No passwords. Login by WhatsApp code." · screenshot of the Hinglish chat ("Mukesh ko aaj absent karo" → AI's reply).
9. **Pricing teaser:** the number, huge: "₹8 per verified visit. ₹2,000 a month minimum. AI included." Link to /pricing.
10. **Honest pre-launch strip (instead of fake social proof):** "We are onboarding our first companies now. Early companies get direct access to the founder." — turns our weakness into a reason to call.
11. **Final CTA band:** one line + WhatsApp button. 12. **Footer:** sitemap links, legal, language, "Made in India" if founder wants it.

**States to design:** nav scrolled/top · mobile menu open · FAQ-less (home has none) · CTA hover/pressed · reduced-motion variant (timeline steps appear without animation).

### 6.2 How it works `/how-it-works`

Long-form version of the loop: the 5 steps each get a full block (product shot + 2-3 sentences + one "edge truth" like "No network at the site? Photos wait on the phone and upload later."). Ends with: what supervisors see (flag review sheet shot), what HR sees (queue shot), what owners see (pulse shot — can be marked "coming soon" honestly if portal ships later). Final CTA band.

### 6.3 Persona pages `/for-owners`, `/for-supervisors`, `/for-workers`

Same skeleton, different content: Hero statement in the persona's own words → "your day with AXHY" 3-4 moments with product shots → the 3 features that matter to THEM → honest boundaries (e.g. workers page: "Big buttons. Three languages. Nothing to type.") → CTA. Owners page additionally gets the billing/statement promise ("You'll see exactly what you'll be invoiced — visits × ₹8, nothing hidden").

### 6.4 Pricing `/pricing`

One card, no tiers, no toggle: **₹8 per AI-verified visit · ₹2,000/month minimum · AI included · no setup fee · invoice billing (we don't auto-charge)**. A worked example in plain words: "300 visits in a month = ₹2,400." FAQ accordion (6-8 real questions: What counts as a visit? What if AI flags wrongly? Who owns the data? Can we export? What happens if we stop? Is worker data safe under DPDP?). CTA band. **States:** accordion open/closed, keyboard focus.

### 6.5 About `/about`

Founder story in first person, plain words, one photo if founder wants. Why: the industry runs on trust nobody can verify, and the people doing the work get blamed first. One section on how we build (worker-first, proof-first). No team grid, no fake advisors.

### 6.6 Demo `/demo`

WhatsApp-first: big button opens wa.me with a prefilled message ("Hi, I run a cleaning company with ~\_\_\_ workers. I want to see AXHY."). Below: what a demo looks like (20 minutes, your real sites, on your phone). Phase 2 only: a 3-field form (name, company, phone) — design it now, ship later; mark in the design file as phase 2.

### 6.7 Help `/help`

Searchable-looking but simple: sections per persona, plain Q&A. This URL is already linked from inside the shipped apps ("How to use Axhy") — it must exist at launch with at least login help, photo help, and "who to contact".

### 6.8 Privacy `/privacy`, Terms `/terms`

Designed (not lawyer-wall): readable type, sticky section nav, "plain words" summary box atop each section. Privacy leads with DPDP, what we store (photos, attendance, phone numbers), retention ("history is kept permanently for legal protection — deleting a company does not erase its legal trail"), and worker-consent reality (the app takes consent in-app).

## 7. Component inventory (design once, reuse everywhere)

Nav bar (top/scrolled) · footer · primary/secondary buttons (default/hover/pressed/disabled/loading) · WhatsApp CTA button (recognizable but on-palette) · section badge (mono label) · step timeline (h+v) · proof cards (verified/flagged) · persona card · pricing card · worked-example block · FAQ accordion · screenshot device frame (phone + browser) · language chip · honest-strip banner · CTA band · legal page shell · 404 art · form field set (label, helper, error, focus — for phase-2 demo form) · toast (form phase 2).

## 8. Interaction & motion

150–300ms, ease-out in / ease-in out, transform+opacity only; one animated element per viewport max (e.g. timeline steps stagger 40ms); `prefers-reduced-motion` = everything appears static; scroll-jacking banned; no autoplaying video. Press feedback on every tappable (≥44px targets, 8px spacing).

## 9. Responsive, performance, SEO, a11y (acceptance criteria for the design)

- Design at **375px and 1440px** for every page (768px where layouts diverge). Mobile-first: an owner on a phone is the primary canvas.
- Performance budget the design must respect: hero image ≤ 120KB AVIF, fonts = the 2-3 families above only, no decorative video, no carousel libraries. LCP < 2.5s on 3G Android.
- Body ≥16px, contrast ≥4.5:1 (check terracotta-on-cream pairs specifically), visible focus rings, heading order h1→h3, alt text noted for every product shot in the design file.
- SEO: every page gets title + meta description + OG image (design one OG template card); schema.org Organization + Product on home/pricing.

## 10. Asset list (what we supply the designer)

Real product screenshots (we will capture fresh, post-deploy, on the emulator at 1080×2400): supervisor Today with flagged visit · flag review sheet (the AI-reason one) · Hinglish chat exchange · worker capture flow (QR/before/after/submit) · worker home · updates "all caught up" · summary screen. Logo/wordmark (exists; designer may propose refinement, not replacement). No stock photography in v1 — product shots carry the site; if photography is wanted later, it must be real Indian facilities, commissioned.

## 11. Designer deliverables checklist ("100% UI design" =)

- [ ] Chosen direction's **token sheet** (colors, type scale, spacing, radii, borders, shadows) — this seeds `packages/web-brand`
- [ ] **Component sheet** — every §7 component in every state
- [ ] **All 10 pages** at 375px + 1440px (768px where it diverges)
- [ ] Nav + footer in all states; mobile menu open
- [ ] FAQ open/closed; form states (phase-2 demo form included)
- [ ] OG image template; favicon/app-icon sizes; 404
- [ ] Reduced-motion notes per animated section
- [ ] Redlines or token references on spacing (4/8px rhythm)

**Out of scope for this brief:** portal UI (HR/Owner/System — separate briefs follow from `00-system-architecture.md` §5), dark mode, hi/te translated layouts (structure must allow ~30% longer strings).

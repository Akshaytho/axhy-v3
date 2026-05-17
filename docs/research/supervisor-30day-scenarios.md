# Supervisor 30-Day Scenarios — Real-world chaos for Axhy v3 simulation

> Research compiled 2026-05-18 for the Axhy v3 supervisor app. Drawn from Indian facility-management trade press (Clean India Journal, BVG/SIS/Sodexo Indeed/Glassdoor), absenteeism research (SHRM India 8% vs 5% world avg; Truein, Keka, HRSpot), RWA + theft case-law (Bengaluru Provident Sunworth case, Cambridge IJLC paper on RWA worker welfare), Hyderabad civic incident reporting (Siasat, Deccan Chronicle, NewsMeter on monsoon power+water disruptions), Ludhiana factory altercation reporting, and Hyderabad-typical supervisor lived experience. Names, sites, and money figures are plausible composites — not real people.

---

## The supervisor's reality (the one-paragraph spine)

Suresh Yadav is 34, lives in Kondapur, supervises 38 housekeeping + pantry workers spread across 10 client sites in west Hyderabad — three IT towers in HITEC City (Cyber Towers, Phoenix Aquila, Mindspace Building 9), two malls (Forum Sujana, Inorbit), one hospital (KIMS Secunderabad), three apartment societies (Aparna Sarovar Grande, My Home Bhooja, Lodha Bellezza), and one school (Oakridge Gachibowli). He owns a 2019 Honda Activa, a cracked-screen Redmi Note 11, and a second SIM purely for WhatsApp groups (one group per site, plus a "boys" group with the workers, plus the HR group with his ops manager Mr. Reddy). His day starts at 5:40 AM when the first muster WhatsApp ping comes from KIMS night-shift (Mary, ward boy lead, asking who's coming for 6 AM relief). It ends at 10:30 PM when he finally closes the day-end roster sheet to his ops manager — except the days it doesn't, because Ravi at Cyber Towers went home drunk, or Lakshmi's husband called saying she fell off the bus, or the RWA secretary at Aparna sent eight angry voice notes about a missed lobby polish. He uses his phone for: marking attendance (currently a Google Form Mr. Reddy made), taking before/after photos when the client demands proof, calling/WhatsApping the 38 workers, pinging HR for advances, photographing salary register pages, and screenshotting the client's complaint message to forward to HR. Half his decisions are "who do I move where, right now, before the client notices"? The other half are "how do I keep this person from quitting tonight"? He forgets things constantly — which is why this app exists.

---

## Scenarios — 70 of them, by category

### A. Attendance chaos (no-show, late, drunk, fake check-in, uniform)

1. **5:48 AM no-show at KIMS** — Mary calls: "Sir, Anjali ICU duty ke liye nahi aayi, phone switched off." Frequency: 2–3×/week. Suresh's move: ring Anjali (no answer), ring her neighbour Saira ("aunty ko bukhar tha raat ko"), mark absent, find a swap from Forum Sujana morning shift, call client supervisor at KIMS to update.
2. **Late by 40 minutes, blames bus** — Ravi shows up at Cyber Towers at 7:40 instead of 7:00. Says TSRTC bus broke down at Madhapur. Daily occurrence with 4–5 workers. Move: warn verbally, but on 3rd time this month logs a "late-mark" (½ day cut) and texts worker the screenshot.
3. **Drunk at handover** — Prakash, night-shift at Phoenix Aquila, smells of alcohol at 10 PM check-in. Security guard rings Suresh. Move: call HR Mr. Reddy, send Prakash home with a sober colleague, find an emergency replacement, take a photo of the duty register noting "sent off — suspected intoxication". Quarterly. Documentation matters because client will ask tomorrow.
4. **Buddy-punching / fake check-in** — Manjunath at Forum Sujana clocks in on the biometric, then leaves and asks Khalid to "punch out at 6". Suresh discovers via CCTV review the client shares. Move: confront both, dock half-day each, and (per the app) require photo+geofence on next punch.
5. **Forgot uniform / wrong colour** — Lakshmi arrives at Lodha Bellezza in pink saree because her grey uniform is at the dhobi. Society won't let her into common areas without uniform. Move: borrow spare from another worker, drive uniform from another site on Activa, or send her home and lose a head-count.
6. **Phone died, can't punch in** — Geetha at Aparna Sarovar's GPS clock-in fails because her phone is dead. She tells the security to call Suresh. Move: manually mark attendance, ask security to vouch in WhatsApp.
7. **No-show with no message at all** — Md. Khalid simply doesn't appear at Mindspace. Phone unreachable for 2 days. Suresh starts asking other workers from same village. Frequency: 1–2×/month. Often means quit-without-notice.
8. **"Aaya tha sir but signed wrong site"** — Pavan reports to Oakridge by mistake instead of school's adjacent corporate annexe (same complex). Punched in at school's attendance sheet. Site supervisor at corporate side flags absence. Disputed mark.
9. **Sister-in-law's funeral, leaves mid-shift** — Saira gets a call at 11 AM at Inorbit, leaves immediately, doesn't tell Suresh till 2 PM. Marks half-day, but client lobby goes uncovered 1–6 PM. Site complaint inbound.
10. **Came but refused to start work** — Wage dispute. Worker physically present, sitting in pantry, refusing to mop until salary credited. Group-think contagion risk — 2 others might join.
11. **Two workers same shift, same site, same role** — Roster bug. Both Mary and Geetha rostered to KIMS oncology floor 2 PM–10 PM. One has to be redeployed in real-time.
12. **"Ghost worker" on muster** — Worker name on roster, biometric ID exists, but nobody can recall hiring this person. Suspect HR data error or old worker not removed. Surfaces during audit.
13. **Got to site, client gate-pass expired** — Security at Cyber Towers refuses entry because Ravi's gate-pass expired last week. Worker stuck at gate at 6:55. Move: phone-call the client admin to extend, OR redirect Ravi to another site.
14. **Came in chappals, not safety shoes** — Hospital infection rule. Worker turned away at KIMS reception by ICA team. Lose head-count for the shift.
15. **Said "fever hai sir" by voice note, came anyway** — Anjali sends WhatsApp at 5 AM saying she's sick, but turns up at 7 AM. Suresh has already arranged a swap. Now two people, one shift, paid head-count chaos.

### B. Leave management

16. **"Boss, kal off chahiye, behan ki shaadi"** — Lakshmi messages 9 PM the night before. No notice. Saturday wedding, can't refuse. Move: find swap from idle pool.
17. **Festival mass-leave (Bonalu / Diwali / Bathukamma)** — 7 of 38 workers ask for leave the same week. Telangana festivals especially. Pool collapses; client SLAs threatened. Need to plan 3 weeks ahead.
18. **Approved leave, then no-show on return day** — Khalid approved leave Mon–Wed, doesn't show Thu, doesn't show Fri. Now must decide: extend, mark absent, or treat as quit.
19. **Fake medical certificate** — Prakash submits a typed "Dr. K. Rao" certificate for 3 sick days. Suresh notices same doctor's name used by 3 different workers this month. Likely paid certificate from a Charminar shop.
20. **Half-day request mid-shift** — Mary at KIMS asks at 12 noon to leave at 2 PM for child's school PTA. Need replacement for 2–10 PM in 2 hours.
21. **Maternity leave handover** — Geetha announces 3rd-trimester at Forum Sujana. Need 6-month replacement, not just a daily swap.
22. **"Going to village for 2 weeks" — never returns** — Migrant workers from Mahbubnagar / Warangal go home for Sankranti and never come back. Effective quit. Common in Jan / May.
23. **Worker requests leave to attend court hearing** — Land dispute back home. Genuine but unverifiable. Half-day cut, advance request often paired.
24. **Election day** — Telangana Assembly poll. Workers want to go to native village to vote. Statutory protection. Need staffing plan.
25. **Death in family — 4 days off, paid leave argued** — Worker says cousin died, client says "tumhe to maami thi, leave nahi banti". Wage cut dispute follows.

### C. Client complaints

26. **"Lobby missed at 11 AM, send photo proof"** — RWA secretary at Aparna voice-notes Suresh angrily. Photo proof from worker auto-uploaded earlier — but it's of B-block, not A-block. Wrong site / wrong building escalation.
27. **Photo mismatch: client says "yeh hamara washroom nahi hai"** — Worker uploaded a different floor's washroom photo by mistake. Trust broken.
28. **Worker rude to resident's child** — RWA complaint that Manjunath shouted at a kid who threw biscuit on the just-mopped floor. He-said-she-said.
29. **Theft accusation — gold chain missing from flat 304** — Lakshmi was in that flat for routine clean. Resident calls Suresh, then security, then RWA, all within an hour. Police FIR risk. (Per Bengaluru Provident Sunworth precedent, RWAs occasionally bury such cases internally — which is a separate liability.)
30. **COVID-style hygiene complaint** — Mall tenant says food court table not sanitised; sends video. Pre/post photo proof required, ATP swab if hospital-grade.
31. **Noise complaint — vacuuming at 10:30 PM** — Apartment resident on floor 4 complains the night-shift vacuum was used past 10 PM cut-off. Worker says "supervisor told me to finish lobby".
32. **Smell complaint — phenyl too strong** — KIMS infection-control team calls — wrong dilution. Audit risk.
33. **Hair found in pantry sink** — Cyber Towers tenant photo. Worker refuses to acknowledge. Re-clean and apology demanded.
34. **Lift floor scratched** — Worker pulled garbage trolley without lift mat. Society demands ₹15,000 damage from Axhy. Salary-cut dispute on worker.
35. **Client says "this worker is not the one we approved"** — Background-verified Ravi was swapped for non-verified Pavan because Ravi was sick. Hospital throws a fit.
36. **WhatsApp from client admin at 11:47 PM** — "Tomorrow morning audit by AVP, ensure all washrooms restocked, sample photos before 7 AM". Suresh has to rouse the night-shift via phone.
37. **Client owes 60-day payment, threatens to drop us** — Not a worker issue, but Suresh hears about it because his retention bonus is tied to renewal. Has to over-perform that month.
38. **Resident records worker on phone, posts on Twitter** — Worker drinking tea on a bench during break, residents call it "loitering". Goes viral in society WhatsApp. PR crisis.

### D. Worker swaps

39. **Last-minute swap — 5:30 AM** — Anjali down with fever; need Saira to cover KIMS instead of Inorbit; need someone else to cover Inorbit. Two-step swap.
40. **Chain swap** — A→B's slot, B→C's slot, C→A's slot. Has to be approved by all three sites + verified the skill match works (ICU-trained vs corporate-cleaning trained).
41. **Swap-then-cancel at 6:15 AM** — Saira agrees to swap, then at 6:15 says "auto nahi mil raha sir, KIMS dur hai". Now Suresh personally rides his Activa with her behind on the seat. (Happens.)
42. **Swap to a site she's never been to** — Worker doesn't know which lift to use, which floor, gets lost. Site supervisor at receiving end annoyed. Need an onboarding pack per site.
43. **Swap into a site with a different uniform colour** — Hospital needs scrubs, society needs sarees. Worker has to detour to depot.
44. **Skill-mismatch swap** — Pavan is a wet-mop hand; KIMS needs an oncology-floor trained worker (biohazard protocol). Per master plan locked decision: one-button "assign anyway", supervisor accepts risk.
45. **Swap to a client-banned worker** — Some clients have a do-not-deploy list. Khalid banned from Cyber Towers (old complaint). System should block.
46. **Swap blocked because worker is on the wrong gate-pass list** — Pre-cleared list at corporate sites. Need 24h notice. Suresh has to call client HR.

### E. Wage / payment disputes

47. **"Boss, advance chahiye 500 ka — bachhe ka school fees"** — Mid-month, ~6 workers ask per month. Suresh has to approve, route to HR Mr. Reddy, screenshot the approval back to worker.
48. **Owed days dispute** — Worker claims 26 days, payroll says 24. Disagreement on the 2 absent days. Suresh's roster is the source of truth — better be accurate.
49. **Damage cut from salary** — Worker broke a glass partition at Phoenix Aquila; ₹3,000 deducted. Worker says it was already cracked. No photo evidence. Dispute.
50. **EPFO confusion** — Worker asking why PF was cut even though "sir bola tha ₹15,000 in-hand". Tries to skip work in protest. Suresh has to do basic PF math on WhatsApp.
51. **ESIC card not yet issued** — Worker visits doctor with ESI claim, gets refused because card pending 3 months. Pays cash from pocket, asks Suresh for reimbursement.
52. **Salary credit delay** — 5th of the month and salary not yet hit accounts. WhatsApp group erupts. Suresh has to ping HR + post a screenshot of HR's "by EOD tomorrow" reply.
53. **Worker's account number wrong** — Salary bounced. Suresh has to chase worker for new passbook photo, forward to HR, ensure re-credit.
54. **Overtime claim disputed** — Worker says she worked 12 hours on audit day, payroll has 8. Roster vs biometric mismatch. Need lock-in time records.
55. **Festival bonus expectation** — Workers assume Diwali bonus is a right. Owner says "depends on collection". Suresh has to manage the disappointment.

### F. Site-level events

56. **New site onboarding** — Forum Sujana Phase-2 opens, supervisor has to do site-walk with client ops manager, document floor count, photograph all chemical-store locations, agree on KPIs, set up muster point, configure roster for 4 new workers, hand over gate-pass list. 3-day intensive.
57. **Site lost — client did not renew** — Inorbit going to a competitor. Suresh now has 4 workers without a site. Redeploy or lay-off conversation.
58. **Festival shutdown of a corporate site** — Cyber Towers closes 23 Oct–2 Nov for Diwali break. Need to redeploy 6 workers or grant unpaid leave.
59. **RWA committee change** — Aparna gets a new secretary who wants a "full audit". Previous arrangement (small chai-paani concessions) is gone. Tighter SLAs, more photos demanded.
60. **Hospital ward shift** — KIMS oncology moves from 4th to 7th floor. Cleaning protocols differ (negative-pressure room, biohazard cart). Need 3-day re-training.
61. **Society RWA refuses to allow male workers** — Lodha Bellezza changes policy after one incident — only female housekeepers in lift lobbies. 2 male workers redeploy.
62. **Site requests pest-control as added scope** — Mall asks for monthly pest-control add-on. Not in contract. Sales call needed but Suresh has to coordinate execution.

### G. Crisis

63. **Worker assault — male resident grabs Saira's arm** — Aparna B-block, flat 502. Saira calls Suresh crying at 2 PM. Suresh: pull her out immediately, call HR, optionally police, brief female workers' lawyer, document everything. Female safety lock.
64. **Worker theft accusation — police arrive on site** — Lakshmi accused of stealing gold (scenario 29) escalates; security guard calls Hitech City PS. Suresh has to be physically present, bring HR, contact lawyer panel.
65. **Worker injured — slipped on wet floor** — Prakash falls in KIMS B-wing, head injury. Site nurse stabilises, ambulance called. ESIC claim, accident report, client incident-report, family informed — all in 4 hours.
66. **Fire drill / actual fire alarm** — Cyber Towers fire alarm triggers at 3 PM. Workers evacuate with residents. Need headcount, re-entry coordination.
67. **Building flooding — monsoon** — 200 mm rain in 4 hours floods Forum Sujana basement. All workers re-deployed to bail water. Supervisor 14-hour day.
68. **Power cut + water cut combo (Hyderabad classic)** — KIMS backup runs but society pumps are off. Toilets at Aparna unusable. Worker complaints + client complaints simultaneous.
69. **Worker collapses — medical emergency** — Geetha (pregnant) fainted in pantry. Suresh rides Activa to KIMS, organises sister's calls, handles HR's ESIC docs.
70. **Supervisor's own phone dies / breaks** — Suresh's Redmi cracked-screen finally dies at 9 AM. Has to borrow worker Ravi's Vivo for the rest of the day. All app sessions interrupted.

### H. Edge cases (concurrent edits, network, photo failures)

71. **Two supervisors editing same roster** — Mr. Reddy from HR also edits the master roster from office at the same time Suresh edits on mobile. Last-write-wins eats Suresh's swap.
72. **Network down at Aparna basement chemical store** — No 4G. Worker can't punch in. Need offline-first photo + queue.
73. **Photo upload fails — 4G drops mid-upload** — 50-photo audit at KIMS, 12 fail. Lost evidence if not queued.
74. **Two photos same minute, different sites** — Worker uploads from KIMS, supervisor uploads from Forum Sujana, both at 14:32. Race condition in event ordering.
75. **Biometric machine offline** — Cyber Towers' biometric device unplugged by housekeeping(!). All check-ins manual for the day.
76. **GPS spoof attempt** — Worker tries Fake-GPS to punch in from home. Caught via velocity check (couldn't have travelled 8 km in 30 seconds).
77. **WhatsApp delivery vs read** — Suresh sends swap order, message shows delivered but not read for 45 minutes. Worker sleeps through. Did he see it? Need explicit ack in-app.

### I. Weekly / monthly rhythm

78. **Monday muster call** — 6 AM WhatsApp roll-call to 38 workers. Suresh tracks who's responded. Stragglers get rung at 6:15.
79. **Salary day (1st)** — All-day phone-call frenzy. Suresh becomes payroll helpdesk.
80. **Mid-month performance check-in with ops manager** — 15th of month, Mr. Reddy asks for site-by-site complaint count, attendance%, attrition, advance %. Suresh has to compile.
81. **Monthly client billing review** — End-of-month, Suresh has to certify worker-days per site. Mistakes cost the company. Client compares against their gate-log.
82. **HR audit — surprise** — HR + a board member walk into Aparna unannounced; check uniforms, PPE, ID cards, biometric log, chemical-store register, MSDS sheets. Failures = fines.
83. **Owner's WhatsApp at 11 PM** — Boss sends "kal subah mujhe Forum Sujana ka top 3 attrition reason chahiye". Suresh stays up.
84. **Worker birthday / wedding** — Small expectations. Suresh remembers via app reminder + sends ₹100 sweet money from team kitty.

---

## Day-by-day chaos calendar (30 days)

Assumptions: Day 1 = Monday, Day 6 = Saturday, Day 7 = Sunday, Day 13 = Saturday-festival (Bonalu), Day 22 = Salary-day variant + audit, Day 26 = monsoon flood day.

### Week 1 — settling in (steady but with surprises)

- **Day 1 (Mon) — opener**: Scenarios #78 (Monday muster), #1 (KIMS 5:48 no-show — Anjali), #4 (buddy-punching at Forum Sujana surfaces via CCTV).
- **Day 2 (Tue)**: #16 (Lakshmi sister-shaadi leave for Saturday), #47 (3 advance requests), #2 (Ravi 40-min late, 3rd time this month — formal warning).
- **Day 3 (Wed)**: #26 (Aparna lobby missed → photo wrong building), #71 (concurrent roster edit by HR overwrites swap), #84 (Geetha birthday).
- **Day 4 (Thu)**: #31 (10:30 PM vacuum noise complaint Aparna), #20 (Mary half-day for child PTA), #74 (race photo upload from two sites same minute).
- **Day 5 (Fri)**: #50 (EPFO confusion — Khalid threatening to skip work), #19 (3rd worker same doctor's note — fake medical pattern), #6 (phone-died check-in).

### Week 2 — festival pressure builds (Bonalu Saturday Day 13)

- **Day 6 (Sat)**: #16 played out — Lakshmi off for sister's wedding, swap chain. #80 (mid-month check-in shifted forward by ops manager).
- **Day 7 (Sun)** — quieter: #17 advance signal — 4 leave requests for next Saturday Bonalu festival. #54 (overtime claim from Khalid).
- **Day 8 (Mon)**: #78 muster, #44 (skill-mismatch swap blocked by app — supervisor uses "assign anyway"), #33 (hair in pantry sink — Cyber Towers tenant photo).
- **Day 9 (Tue)**: #18 (Khalid approved leave Mon–Wed, doesn't return Thu — flag), #59 (Aparna new RWA secretary demands full audit), #76 (GPS-spoof attempt by Pavan caught).
- **Day 10 (Wed)**: #29 (theft accusation Lakshmi at Aparna 304 — gold chain), #64 escalating — police informed by RWA secretary, FIR risk.
- **Day 11 (Thu)**: #64 continued — Suresh + HR + lawyer at site. Meanwhile #1 (another no-show at KIMS) and #21 (Geetha maternity announcement).
- **Day 12 (Fri)**: #17 — 7 workers confirmed leave for Bonalu Saturday. Pool collapse. Mass swap planning. #36 (client audit message 11:47 PM for KIMS Sat morning).

### Week 3 — festival weekend + new site onboarding

- **Day 13 (Sat — Bonalu festival)**: #17 fires, #56 starts (Forum Sujana Phase-2 onboarding kick-off — Suresh runs the site-walk while short-staffed), #67 light rain hits Inorbit.
- **Day 14 (Sun)**: Lighter — #75 (biometric machine offline at Cyber Towers — manual day).
- **Day 15 (Mon)**: #78 muster, #80 mid-month check-in with Mr. Reddy (compile attendance, complaints, attrition), #3 (Prakash drunk at Phoenix Aquila night handover).
- **Day 16 (Tue)**: #56 day 2 onboarding, #45 (swap to client-banned worker — system blocks, supervisor overrides). #11 (two workers same shift bug at KIMS).
- **Day 17 (Wed)**: #56 day 3 onboarding done. #34 (lift scratched — Lodha demands ₹15k). #51 (ESIC card not issued — worker out-of-pocket).
- **Day 18 (Thu)**: #38 (worker filmed by resident, posted on Twitter — Aparna). #46 (gate-pass clearance issue at Phoenix Aquila — 24h notice missed). #84 (Mary's daughter's birthday).
- **Day 19 (Fri)**: #58 (Cyber Towers announces Diwali shutdown — 6 workers to redeploy in 2 weeks). #57 fear — Inorbit indicates non-renewal next quarter.

### Week 4 — audit week + monsoon

- **Day 20 (Sat)**: #82 (surprise HR audit at Aparna — PPE missing on 2 workers, MSDS register outdated). Fines pending.
- **Day 21 (Sun)** — quiet, but #83 owner's 11 PM WhatsApp arrives: "Subah 6 baje Forum Sujana attrition reason chahiye".
- **Day 22 (Mon — SALARY DAY)**: #79 all-day payroll helpdesk. #52 (3-hour delay in credit — WhatsApp group erupts). #53 (Geetha's account number wrong — bounced). #36 (client audit by AVP at KIMS).
- **Day 23 (Tue)**: #5 (Lakshmi uniform at dhobi, blocked at Lodha), #41 (swap-then-cancel — Suresh rides Activa with Saira behind), #55 (Diwali bonus expectation conversation starts in worker WhatsApp group).
- **Day 24 (Wed)**: #63 (Saira assault incident at Aparna B-502 — male resident grabs arm — CRISIS). Full afternoon: pull her, HR + lawyer + optional police.
- **Day 25 (Thu)**: #63 follow-through — Saira on leave, redeploy male worker to that block (safer optics). #25 (worker claims cousin died, 4 days leave + advance request bundled).
- **Day 26 (Fri — MONSOON FLOOD)**: #67 fires hard at Forum Sujana basement (200 mm rain). #68 power + water combo across Aparna + KIMS. #65 (Prakash slips at KIMS — head injury — ambulance). #70 (Suresh's own phone dies at 9 AM mid-crisis). 14-hour day.
- **Day 27 (Sat)**: Recovery. #66 (fire-drill rescheduled at Cyber Towers — false alarm earlier). #28 (worker rude to resident's child — Manjunath at My Home Bhooja).
- **Day 28 (Sun)**: #22 (Manjunath, who shouted at kid, doesn't come back from his "2 days at Mahbubnagar" — effective quit). #62 (Inorbit mall asks for pest-control add-on quote).
- **Day 29 (Mon)**: #78 muster. #7 (Khalid full silent no-show, week 2). #81 (end-of-month billing certification — Suresh compiles worker-days for all 10 sites).
- **Day 30 (Tue)**: #61 (Lodha RWA bans male workers from lift lobbies), #60 (KIMS oncology ward shift to 7th floor — protocol re-training), #15 (Anjali says fever-then-comes anyway — double-booked confusion). Day closes with #83 (owner asks for next-month attrition forecast at 10:47 PM).

---

## Cross-cutting "feels-real" details to weave into the sim

- **Money is always small and always urgent**: ₹300 for medicine, ₹500 for school fees, ₹1,200 for festival, ₹2,000 cash-advance against a ₹14,500/month wage. Suresh handles 5–8 advance asks per month per 38 workers.
- **The Redmi-Note-with-cracked-screen problem**: voice-notes outnumber text 4:1. Workers can't read English UI. App must be Telugu/Hindi-readable + icon-first.
- **WhatsApp is the operating system, the app is the wedge**: every event today goes through WhatsApp. The supervisor screenshots app evidence into WhatsApp constantly. Forwarding/export must be one-tap.
- **The owner is one WhatsApp away**: end-of-day, the owner asks for a number. Suresh needs a one-screen end-of-day digest.
- **Telangana monsoon = Jun–Sep**: 2–3 days per month of disruptive rain, water, power. Calendar-able.
- **Festivals matter**: Bonalu (Jul), Bathukamma (Oct), Diwali (Oct/Nov), Sankranti (Jan). Mass-leave + bonus expectation + village migration.
- **Hospital ≠ Mall ≠ Society**: chemicals differ (phenyl vs disinfectant vs bleach), PPE differs (mask+gloves+shoes mandatory at KIMS, only gloves at Forum), uniform differs (scrubs vs saree vs polo), audit differs (NABH at KIMS, RWA at Aparna, AVP at Cyber Towers).
- **The supervisor is also a counsellor**: half his calls are "sir, ghar mein jhagda hua", "sir, beta exam mein fail ho gaya". The app cannot solve this, but should not interrupt it (no popups during a long call).
- **Names + sites used in this doc are composites**: Suresh, Ravi, Lakshmi, Anjali, Manjunath, Saira, Prakash, Geetha, Md. Khalid, Mary, Pavan, plus Aparna Sarovar Grande, Cyber Towers, Phoenix Aquila, Mindspace, Forum Sujana, Inorbit, KIMS Secunderabad, Lodha Bellezza, My Home Bhooja, Oakridge Gachibowli.

---

## Source notes (for traceability)

- Clean India Journal — "A day in the life of a supervisor" (housekeeping operations cadence).
- Indeed India + Glassdoor — BVG India Ltd, SIS, Sodexo housekeeping supervisor compensation & duty descriptions; ~₹19,125/month median.
- SHRM India (via HRSpot, Keka, Truein, ADP India) — Indian absenteeism rate 8% vs world 5%; migratory labour, festival season, casual hiring as causal drivers.
- ICEHRM / TeamSense — no-show employee handling protocols.
- Cambridge International Journal of Law in Context — "Justice within the new factory gates: how to hold RWAs responsible for workers' welfare" (precedent on housekeeping/maintenance labour rights vs RWAs).
- TheNewsMinute, Bengaluru — Provident Sunworth Apartments RWA case (theft + harassment buried internally).
- Siasat / Deccan Chronicle / NewsMeter — Hyderabad rain + power + water disruptions (RC Puram, BHEL, Chandanagar, Miyapur, Kukatpally, Erragadda, SR Nagar, Sanathnagar).
- The Tribune (Ludhiana) — factory worker assault by colleague (night-shift two-person scenario maps to single-shift cleaning crews).
- Asianet Newsable, Lexology — WhatsApp resignation / abrupt quitting context for migrant contract workers.
- Hirist, HRCabin, Brainly — Diwali / Pongal / festival leave application norms.
- SafetyCulture, Lumiform, Aravind, Bluvalt — hospital infection-control + housekeeping audit checklists used by Indian NABH-accredited facilities.

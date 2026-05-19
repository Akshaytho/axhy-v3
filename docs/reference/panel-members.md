---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Virtual Panel — 73 Members

The Axhy v3 design panel. Every product decision goes through relevant members. They debate, founder picks, panel re-critiques, then lock.

## How to Use This Panel

- For ANY product decision: identify 5-10 relevant panel members by domain
- Members debate from their bias/expertise
- Founder picks from clear options
- Panel re-critiques the pick before locking
- When panel disagrees, that's signal — the disagreement IS the useful information

## ENGINEERING (12 members)

**1. Maya Krishnan — Principal Software Architect (P8)**
18 yrs at Stripe + Datadog. Wrote "Thin Service Boundaries" doctrine. Pro-determinism, pro-state-machines, anti-agentic-loops, anti-microservices-pre-PMF. Cares about: cascading failure modes, idempotency, single-points-of-failure. Catches when AI is being smuggled into places it shouldn't be.

**2. Vikram Shah — Staff Backend Engineer (P7), multi-tenant SaaS**
12 yrs at Linear + Notion. Owned per-workspace lock service at Linear. Caught 2 Series-B-killing tenant bugs. Paranoid about cross-tenant leaks (correctly so). Cares about: schema boundaries, per-tenant isolation, cache invalidation safety.

**3. Aanya Mehta — Senior AI/ML Engineer (P7)**
9 yrs at OpenAI + Google (Whisper, GPT-4o, Gemini, Bhashini). Native Hindi/Telugu/English. Knows where Indian-language voice AI fails. Cares about: realistic accuracy claims, prompt injection defenses, latency at scale, RAG vs full-context tradeoffs.

**4. Rohit Kapoor — Senior Security & Privacy Engineer (P7)**
10 yrs at Razorpay + Atlassian. OSCP, CISSP. Worked on India DPDP Act guidelines drafting. Catastrophizer (helpfully so) — assumes any input is malicious. Cares about: DPDP compliance, prompt injection vectors, data residency, privacy boundaries.

**19. Vivek Iyer — CTO / VP Engineering**
16 yrs at Stripe + Razorpay + early Freshworks. Built scale-out teams (3 to 80) at Razorpay. System coherence; arbitrates when engineers disagree. Cares about: maintainability, "will this still make sense at 100K LoC?"

**22. Rajat Saxena — Senior Frontend Engineer**
10 yrs at Flipkart + Atlassian. Rebuilt Flipkart's seller dashboard during tenant-isolation crisis. Cares about: bundle size, hydration cost, render performance, SSR, dark/light mode. Admin web architect.

**23. Priya Nair — Senior Mobile Engineer (ex-Cred, ex-Razorpay)**
9 yrs at Cred + Razorpay mobile. Rebuilt Cred's photo-capture for INR 6K phones. Cares about: cold start <2s, tap-to-paint <100ms, no-jank, low-end Android, App Bundle size. NFR1-3, NFR9-11 constraints.

**25. Karthik Ravi — Senior Data Engineer**
8 yrs at Phonepe + Stripe data teams. Built Phonepe's transaction-pattern analytics. Cares about: query performance at scale, partitioning, archival, ETL. Knows when "just use Postgres" fails.

**26. Amir Sharma — DevOps / SRE / Platform Engineer**
11 yrs at Netflix + Razorpay reliability. Owned Razorpay payments during Diwali (10x traffic, 0 downtime). Cares about: API p95/p99, uptime SLA, deploy speed, blast radius, observability. NFR4-5.

**28. Deepa Krishnan — Senior QA / Test Engineer**
12 yrs at Microsoft + Atlassian QA. Edge cases per screen (empty/loading/error/success/edge). NFR8 (27-combination test matrix). Cares about: automated regression, real device testing, accessibility.

**29. Saurabh Mehta — Engineering Manager**
9 yrs at Atlassian + Razorpay. Led 8-person React Native teams at scale. Cares about: AI-assisted code review, file size limits (max 300 lines), strict TypeScript, no TODO in committed code.

**8. Aditya Joshi — Senior Voice Engineer**
8 yrs at Bhashini + Sarvam.ai. PhD computational linguistics. Native Marathi, fluent Hindi/Telugu/Tamil/English. Knows trap zones for Indian-language voice products. Cares about: noise, code-switching, accent variance.

## PRODUCT & DESIGN (7 members)

**5. Shalini Iyer — Principal PM (P8), B2B SaaS strategy**
14 yrs at Atlassian + Notion + Razorpay. Launched 3 products to $10M+ ARR. Killed 5 via no-go memos. Brutal scope discipline. NOTE: dialed back from over-conservative per founder feedback. Participates but doesn't get casting vote on scope.

**30. Nikhil Bhasin — VP / Head of Product**
13 yrs at Atlassian + Razorpay + early Freshdesk. Killed 12 features via no-go memos. Roadmap discipline, prioritization. Senior arbiter when founder + Shalini disagree.

**7. Sara Park — Staff Product Designer (P7)**
11 yrs at Linear, Slack, Superhuman. Shipped Linear's universal-chat surface. Ruthless about UX clarity; hates clever UIs that surprise users. Cares about: tap counts, cognitive load, accessibility, contextual UX.

**11. Dr. Priya Subramanian — Senior UX Researcher (P7)**
12 yrs at Microsoft Research, Google UX, Atlassian. PhD HCI; specialty: B2B field research in low-resource markets. Anti-leading-questions, pro-Mom-Test. Cares about: interview rigor, politeness bias correction.

**34. Tanvi Bhatia — Content Designer / Technical Writer**
7 yrs at Stripe + Notion docs. Wrote Notion's Hindi help center. Cares about: error messages, empty states, tooltips, no SaaS jargon, plain English in 4 languages.

**35. Arjun Khan — Design Systems / UI Engineer**
6 yrs at Linear + Figma. Owned Linear's universal-chat UI component layer. Cares about: NFR2 (Reanimated 3), 60fps animations, semantic color tokens, accessibility tree. Bridges design to engineering.

**10. Dr. Eric Chen — Distinguished Engineer (P9+, retired)**
30 yrs Bell Labs + Google + DeepMind. 4 products at 100M+ users. Predicted Whisper-free-by-2026 in 2023. 10-year arc bets; sees around corners. Cares about: long-term defensibility, which features commoditize when.

## SALES & GTM (5 members)

**6. Karthik Reddy — Indian B2B founder (INR 50 Cr exit)**
Ex-founder Vyapar Compliance, sold to Khatabook for INR 150 Cr. 12 yrs selling to Indian SMEs. Multilingual. Cares about: who actually buys, who decides, what Indian SMBs actually pay. Fills founder's India GTM gap.

**36. Vishal Khanna — VP Sales / Head of Revenue**
11 yrs at Freshworks + Zoho + Razorpay sales. Sold Freshworks early India deals (0 to 100Cr ARR). Cares about: enterprise vs SMB segment, contract length, pipeline velocity.

**37. Kavita Reddy — Founding Account Executive**
8 yrs at Razorpay + greytHR + sumHR (founding AE at all three). Closed Razorpay's first 50 enterprise deals. Cares about: time-to-close, deal velocity, when to discount vs walk away.

**38. Rahul Krishnan — SDR**
4 yrs at Freshworks + Zoho outbound. Built outbound playbooks for B2B India. Cares about: response rate, qualification accuracy, hand-off quality.

**39. Aditya Singh — Solutions Engineer**
9 yrs at Stripe + Razorpay sales engineering. Cares about: NFR18 (demo mode tenant), demo flow, "what if customer asks X" answers.

## PRICING & FINANCE (7 members)

**9. Naina Bansal — Pricing Strategist (OpenView Partners)**
12 yrs SaaS pricing advisory. Designed pricing for 80+ B2B SaaS. Wrote "Value Metric Selection" framework. Cares about: value metric alignment, supervisor surcharge, margin sustainability.

**13. Meera Tan — FP&A Director**
10 yrs PwC + Stripe + current INR 40 Cr B2B SaaS. Models SaaS unit economics for living. Skeptical of margin claims without sensitivity analysis. Cares about: CAC payback, hidden costs, 90-day cash gap.

**53. Gaurav Mehta — CFO / Head of Finance**
12 yrs at Razorpay + early Stripe India. Led Razorpay Series A through D. Cares about: runway, burn rate, gross margin, LTV/CAC, when to raise vs grind.

**55. Naveen Reddy — Controller / Senior Accountant**
14 yrs at PwC + KPMG. Specialty: Indian GST, SaaS revenue recognition. Cares about: clean books, monthly closes, GST e-invoicing, audit trails.

**56. Pooja Khanna — Revenue Operations**
7 yrs at Razorpay + Stripe RevOps. Built Razorpay billing engine for INR 500Cr+ ARR. Cares about: 30-day NET, dunning, billing accuracy at scale.

**57. Devraj Sharma — Procurement / Vendor Management**
8 yrs at Razorpay + Atlassian vendor management. Cares about: per-tenant AI cost, enterprise contract pricing for Anthropic/OpenAI, multi-vendor risk.

**40. Sneha Pandey — Sales Operations Analyst**
6 yrs at Zoho + Freshworks RevOps. Pipeline forecasting models for INR 100Cr+ ARR. Cares about: which leads convert, deal scoring, lost-deal analysis.

## CUSTOMER SUCCESS & SUPPORT (5 members)

**41. Anand Iyer — VP Customer Success**
10 yrs at Freshworks + Atlassian. Drove churn from 30% to 8%. Cares about: NRR, pilot conversion, customer health scores. Pilot-to-paid is the make-or-break metric.

**42. Riya Kapoor — CSM** [DIALED BACK]
6 yrs at Notion + Atlassian. Founder said "CSM is making our product more complicated." Limited to retention/expansion decisions only. Do NOT use in feature scope debates.

**43. Ravi Mehta — Onboarding Specialist**
7 yrs at Razorpay + Phonepe onboarding. Led Razorpay's 4-hour-to-self-serve evolution. Cares about: 8-hour founder time per pilot, AI conversational onboarding accuracy.

**44. Karan Sethi — Support Engineer**
8 yrs at Zoho + Razorpay support. Triage automation, self-help patterns. Cares about: NFR12 (Sentry), NFR13 (OTP fallback), self-recovery flows. Solo founder can't scale support past customer 20.

**45. Sushma Patel — Customer Education**
6 yrs at Atlassian + Notion. Created Notion's multilingual product video series. Cares about: NFR14 (60-sec how-to video), NFR15 (first-time tooltips). Workers won't read; videos must be 60 seconds by someone who looks like them.

## MARKETING (7 members)

**46. Megha Iyer — VP Marketing / CMO**
11 yrs at Razorpay + Freshworks marketing. Built Razorpay's brand from "boring gateway" to "developer-loved." Cares about: positioning, brand voice, launch sequencing. Prevents over-rotating on Linear minimalism for Indian SMB owners.

**47. Amit Khanna — Product Marketing Manager**
7 yrs at Atlassian + Stripe PMM. Feature launch comms, conversion copy. Cares about: do customers understand the feature in 5 seconds?

**48. Shreya Gupta — Content / SEO**
5 yrs at Razorpay + Khatabook content. 500+ blog posts ranking for Indian B2B keywords. Low priority for v3.0, critical for 2027 scale.

**49. Anjali Patel — Performance Marketer (Growth)**
6 yrs at PhonePe + Swiggy growth. Cares about: NFR16 (telemetry from day 1), conversion metrics, time-to-clock-in, voice adoption rate.

**50. Rohan Sharma — Brand & Visual Designer**
9 yrs at Linear + Notion + early Stripe brand. Designed Linear's marketing site. Cares about: typography, color rhythm, illustration decisions. Linear/Vercel taste applied to Indian B2B.

**51. Komal Bhatt — Community Manager**
5 yrs at Notion + Cred community. Built Notion India's 50K-member community. Low priority for v3.0, critical at 100+ customers.

**52. Vikrant Joshi — PR / Communications**
8 yrs at Edelman + Razorpay PR. Cares about: founder narrative, when to be public vs quiet. Founder is introvert; Vikrant represents comms discipline.

## LEGAL & COMPLIANCE (4 members)

**58. Anushka Iyer — General Counsel**
13 yrs at Atlassian + Razorpay legal. Indian B2B SaaS specialist. Cares about: MSA quality, IP assignment, GDPR/DPDP, regulatory horizon. Prevents 6-month contract negotiation cycles.

**59. Vinod Patel — DPO (Data Protection Officer)**
10 yrs at Atlassian + India DPDP drafting. Cares about: DPDP enforcement (expected 2026 Q3), voice file retention, consent flows. Non-negotiable input.

**60. Raghav Sharma — Compliance Manager**
9 yrs at Razorpay compliance + ISO certification. Cares about: HR acknowledgment trails, audit log completeness. Argues "compliance trails" are a sellable feature.

**61. Tara Bhatia — Commercial Lawyer**
7 yrs at Khaitan & Co + Razorpay contracts. B2B SaaS MSAs in India. Pre-signed templates that Indian buyers' lawyers don't redline heavily.

## PEOPLE & TALENT (4 members)

**62. Aarti Krishnan — VP People / Head of HR**
11 yrs at Razorpay + Freshworks people teams. Built Razorpay culture from 50 to 1000. Cares about: when to hire, what role first, comp band, equity. First hire is everything.

**63. Pranav Reddy — Recruiter**
6 yrs at Razorpay + Freshworks recruiting. Knows how to find an ex-Sodexo ops manager who's curious about startups (likely first hire).

**64. Neha Sethi — People Ops**
5 yrs at Atlassian + Freshworks. Payroll, EPF/ESIC/POSH compliance for Indian startups. Relevant when team grows to 3-5 people.

**65. Sumit Khanna — Learning & Development**
4 yrs at Atlassian + Notion L&D. Ramp time, role-specific training. Largely future — relevant when team is 10+.

## OPERATIONS & FIELD (5 members)

**15. Akshay Thota — CEO / Founder**
Orchestrator across all debates. Final decision-maker. Vision, persistence, willingness to push back on conservative scope. Needs the panel because his pattern recognition is biased.

**16. Aman Verma — COO / Head of Operations**
14 yrs at Flipkart + Swiggy operations. Ran Swiggy's Tier-2 expansion (50 cities in 18 months). Process discipline; turns ad-hoc rituals into repeatable systems. "This falls over at 100x scale" reflexes.

**17. Anjali Patel — Chief of Staff**
6 yrs at Razorpay + early YC startup. Turns founder's chaos into legible decisions. Cares about: nothing slips, every decision has owner + deadline. Institutional memory for a forgetful founder.

**12. Suresh Pillai — FM Operations Consultant**
22 yrs at Sodexo + G4S + own consultancy. 200+ floor-walks. Speaks operations-Indian. Knows what supervisors ACTUALLY do all day. Catches "matches my idea of FM but not real FM" mistakes.

**67. Manoj Kumar — Field Operations Coordinator**
12 yrs at Sodexo + G4S. Real-world site deployment. Cares about: one-handed operation, dust/sweat/glare handling. Argues against design assumptions that don't survive real Indian sites.

## EXTERNAL (5 members)

**14. Arjun Khanna — Sequoia India Technical Partner**
8 yrs investing + 4 yrs Founding Engineer at Freshworks. 1000+ pitches reviewed. Investability lens. When founder raises, Arjun's panel commentary is the practice round.

**68. Divya Reddy — Pilot / Beta Program Manager**
8 yrs at Atlassian + Razorpay. Pilot conversion mechanics. Cares about: pilot health, time-to-first-value, when to extend vs pull plug.

**69-73. External vendors** — CA firm (at 5+ paying customers), external legal counsel (at first enterprise deal), design agency (Lovable for v3.0), PR agency (at 5 Cr ARR), recruitment agency (for senior hires beyond first 5).

## Panel Composition Logic

The mix prevents groupthink:

- Engineers keep architecture honest
- Founders + sales keep market reality honest
- Designers + content keep UX honest
- AI/voice specialists keep AI claims honest
- Pricing/finance keep economics honest
- Compliance/security keep operations honest
- Customer success keep retention honest
- Field ops keep deployment reality honest
- VC + Board keep fundability honest
- People keep org-design honest

When panel members disagree, that disagreement is the useful information. Founder decides with conscious tradeoff awareness.

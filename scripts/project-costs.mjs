#!/usr/bin/env node
/**
 * scripts/project-costs.mjs
 *
 * Cost projection CLI. Takes scale parameters, prints a full breakdown of
 * monthly + yearly costs across infrastructure + AI, derived from ADR-0023
 * (per-surface model policy) and the storage math from Day 2.
 *
 * Use before any pricing conversation, before scaling decisions, before any
 * "what does this cost at customer #50" question.
 *
 * Usage:
 *   node scripts/project-costs.mjs                       # default scenario
 *   node scripts/project-costs.mjs --customers 50 --workers 25000 --visits-per-day 1.5
 *   node scripts/project-costs.mjs --scenario big
 *
 * Built-in scenarios: pilot, small, medium, big, enterprise
 *
 * @derives(ADR-0023)
 */

const SCENARIOS = {
  pilot: { customers: 1, workers: 50, sites: 5, visitsPerWorkerPerDay: 1.5, daysPerYear: 300 },
  small: { customers: 5, workers: 250, sites: 20, visitsPerWorkerPerDay: 1.5, daysPerYear: 300 },
  medium: { customers: 25, workers: 2500, sites: 150, visitsPerWorkerPerDay: 1.5, daysPerYear: 300 },
  big: { customers: 5, workers: 5000, sites: 250, visitsPerWorkerPerDay: 1.5, daysPerYear: 300 },
  hundred: { customers: 100, workers: 10000, sites: 1000, visitsPerWorkerPerDay: 1.5, daysPerYear: 300 },
  enterprise: { customers: 200, workers: 25000, sites: 2000, visitsPerWorkerPerDay: 1.5, daysPerYear: 300 },
};

// ─── Cost constants (in INR) — single source of truth ────────────────────────

const INR_PER_USD = 82.5;

const COST = {
  // Infra
  postgresBaseMonthly: 1_500,
  postgresStoragePerGbMonthly: 20,
  r2StoragePerGbMonthly: 1.25, // Cloudflare R2
  // Per-event storage budgets (KB on disk, post-index)
  storageKbPerVisitRow: 5,
  storageKbPerAuditEvent: 5,
  auditEventsPerVisit: 5,
  storageKbPerWorker: 2,
  storageKbPerSite: 1,
  storageKbPerVerificationText: 1,
  storageKbPerVoiceTranscript: 0.5,
  // Photos (R2)
  photosPerVisit: 12,
  photoSizeKbAvg: 250,
  // Vectors
  storageKbPerVectorChunk: 25,
  // AI per-call estimates (₹) — derived from ADR-0023
  ai: {
    voiceParsePerCall: 0.5,        // Sonnet 4.6 mid-cost
    aiVerificationPerCall: 0.4,    // GPT-5.4 multimodal
    aiOnboardingPerCall: 2_500,    // Opus 4.7, but only ~1 per new customer
    aliasMapPerCall: 0.04,         // GPT-5.4-nano
    transcriptCleanupPerCall: 0.15,// Haiku 4.5
    sttPerMinute: 2,               // Sarvam (avg)
    embeddingPer1KChunks: 2,       // text-embedding-3-small ~₹0.002/chunk
  },
  // Voice/AI volume assumptions
  voiceAdoptionRate: 0.3,          // 30% of visits include worker voice
  voiceNoteSeconds: 30,
  supervisorVoiceParsesPerSupervisorPerDay: 10,
  supervisorsPerCompany: 6,
  workerNickAliasMapPerNewWorkerPerYear: 1, // batched once
};

// ─── CLI parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let scale = SCENARIOS.big;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--scenario' || a === '-s') {
    const name = args[++i];
    if (!SCENARIOS[name]) {
      console.error(`Unknown scenario: ${name}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
      process.exit(1);
    }
    scale = { ...SCENARIOS[name] };
  } else if (a === '--customers') scale.customers = Number(args[++i]);
  else if (a === '--workers') scale.workers = Number(args[++i]);
  else if (a === '--sites') scale.sites = Number(args[++i]);
  else if (a === '--visits-per-day') scale.visitsPerWorkerPerDay = Number(args[++i]);
  else if (a === '--days-per-year') scale.daysPerYear = Number(args[++i]);
  else if (a === '--help' || a === '-h') {
    console.log(`
Cost projection CLI for Axhy v3.

Usage:
  node scripts/project-costs.mjs [options]

Options:
  --scenario <name>      Built-in: ${Object.keys(SCENARIOS).join(', ')}
  --customers <n>
  --workers <n>
  --sites <n>
  --visits-per-day <n>   Average visits per worker per working day (default 1.5)
  --days-per-year <n>    Working days per year (default 300)
  --help

Defaults to scenario "big" (5 customers, 5000 workers, 250 sites).
    `);
    process.exit(0);
  }
}

// ─── Derive volume ────────────────────────────────────────────────────────────

const visitsPerYear = scale.workers * scale.visitsPerWorkerPerDay * scale.daysPerYear;
const supervisors = scale.customers * COST.supervisorsPerCompany;
const supervisorParsesPerYear =
  supervisors * COST.supervisorVoiceParsesPerSupervisorPerDay * scale.daysPerYear;
const voiceTranscriptsPerYear = visitsPerYear * COST.voiceAdoptionRate;
const voiceMinutesPerYear =
  (voiceTranscriptsPerYear * COST.voiceNoteSeconds) / 60 +
  (supervisorParsesPerYear * COST.voiceNoteSeconds) / 60;

// ─── Storage breakdown (GB) ───────────────────────────────────────────────────

const kbToGb = (kb) => kb / (1024 * 1024);

const storage = {
  workerRows: kbToGb(scale.workers * COST.storageKbPerWorker),
  siteRows: kbToGb(scale.sites * COST.storageKbPerSite),
  visitRows: kbToGb(visitsPerYear * COST.storageKbPerVisitRow),
  auditEvents: kbToGb(visitsPerYear * COST.auditEventsPerVisit * COST.storageKbPerAuditEvent),
  verificationTexts: kbToGb(visitsPerYear * COST.storageKbPerVerificationText),
  voiceTranscripts: kbToGb(voiceTranscriptsPerYear * COST.storageKbPerVoiceTranscript),
  // Vectors: ~1 chunk per (verification, transcript, weekly-worker-summary, weekly-site-summary)
  vectors: kbToGb(
    (visitsPerYear * 0.05 + // 5% of visits embedded (flagged/complained)
      voiceTranscriptsPerYear * 0.5 + // 50% of voice transcripts embedded
      scale.workers * 52 + // weekly worker summaries
      scale.sites * 52 + // weekly site summaries
      scale.customers * 1000) * // per-tenant docs
      COST.storageKbPerVectorChunk,
  ),
};

const postgresGb = Object.values(storage).reduce((a, b) => a + b, 0);
const photosGb = kbToGb(visitsPerYear * COST.photosPerVisit * COST.photoSizeKbAvg);

// ─── AI cost breakdown (₹/year) ───────────────────────────────────────────────

const ai = {
  voiceChangeParse: supervisorParsesPerYear * COST.ai.voiceParsePerCall,
  aiVerification: visitsPerYear * COST.ai.aiVerificationPerCall,
  aiOnboarding: scale.customers * COST.ai.aiOnboardingPerCall,
  aliasMap: scale.workers * COST.ai.aliasMapPerCall, // ~once per worker per year (alias batch)
  transcriptCleanup: voiceTranscriptsPerYear * 0.2 * COST.ai.transcriptCleanupPerCall, // 20% need cleanup
  stt: voiceMinutesPerYear * COST.ai.sttPerMinute,
  embeddings: ((postgresGb * 1024 * 1024) / 25) * (COST.ai.embeddingPer1KChunks / 1000), // estimate chunks from vector storage
};

const aiYearly = Object.values(ai).reduce((a, b) => a + b, 0);

// ─── Infra cost breakdown (₹/month + ₹/year) ─────────────────────────────────

const infraMonthly = {
  postgresBase: COST.postgresBaseMonthly,
  postgresStorage: postgresGb * COST.postgresStoragePerGbMonthly,
  r2Storage: photosGb * COST.r2StoragePerGbMonthly,
};
const infraMonthlyTotal = Object.values(infraMonthly).reduce((a, b) => a + b, 0);

// ─── Revenue (per master plan §B) ────────────────────────────────────────────

const billablePerVisit = 8; // ₹8/visit
const monthlyFloor = 2000;
const visitsPerCustomerPerMonth = visitsPerYear / scale.customers / 12;
const subtotal = visitsPerCustomerPerMonth * billablePerVisit;
const perCustomerMonthly = Math.max(subtotal, monthlyFloor);
const monthlyRevenue = perCustomerMonthly * scale.customers;
const yearlyRevenue = monthlyRevenue * 12;

// ─── Output ───────────────────────────────────────────────────────────────────

const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const pct = (a, b) => ((a / b) * 100).toFixed(1) + '%';

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('AXHY v3 — Cost projection');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Scenario:');
console.log(`  Customers:                     ${scale.customers}`);
console.log(`  Workers (combined):            ${scale.workers}`);
console.log(`  Sites:                         ${scale.sites}`);
console.log(`  Visits / worker / day:         ${scale.visitsPerWorkerPerDay}`);
console.log(`  Working days / year:           ${scale.daysPerYear}`);
console.log(`  ────────────────────────────────────────`);
console.log(`  Total visits / year:           ${Math.round(visitsPerYear).toLocaleString()}`);
console.log(`  Supervisors:                   ${supervisors}`);
console.log(`  Voice transcripts / year:      ${Math.round(voiceTranscriptsPerYear).toLocaleString()}`);
console.log(`  Voice minutes / year:          ${Math.round(voiceMinutesPerYear).toLocaleString()}`);
console.log('');

console.log('Storage:');
console.log(`  Postgres (operational + audit + AI text + vectors)`);
for (const [k, v] of Object.entries(storage)) {
  console.log(`    ${k.padEnd(28)} ${v.toFixed(2)} GB`);
}
console.log(`    ${'─'.repeat(28)}`);
console.log(`    Postgres TOTAL:              ${postgresGb.toFixed(2)} GB`);
console.log(`  R2 (photos):                   ${photosGb.toFixed(0)} GB (${(photosGb / 1024).toFixed(2)} TB)`);
console.log('');

console.log('Infrastructure cost (₹/month):');
for (const [k, v] of Object.entries(infraMonthly)) {
  console.log(`  ${k.padEnd(28)} ${fmt(v)}`);
}
console.log(`  ${'─'.repeat(28)}`);
console.log(`  Infra monthly:                 ${fmt(infraMonthlyTotal)}`);
console.log(`  Infra yearly:                  ${fmt(infraMonthlyTotal * 12)}`);
console.log('');

console.log('AI cost (₹/year, ADR-0023 per-surface policy):');
for (const [k, v] of Object.entries(ai)) {
  console.log(`  ${k.padEnd(28)} ${fmt(v).padStart(14)}`);
}
console.log(`  ${'─'.repeat(28)}`);
console.log(`  AI yearly:                     ${fmt(aiYearly).padStart(14)}`);
console.log(`  AI monthly:                    ${fmt(aiYearly / 12).padStart(14)}`);
console.log('');

console.log('Revenue (master plan §B pricing):');
console.log(`  ₹${billablePerVisit}/visit, ₹${monthlyFloor.toLocaleString('en-IN')}/month floor per customer`);
console.log(`  Visits / customer / month:     ${Math.round(visitsPerCustomerPerMonth).toLocaleString()}`);
console.log(`  Per customer / month:          ${fmt(perCustomerMonthly)}`);
console.log(`  Monthly revenue (${scale.customers} customers): ${fmt(monthlyRevenue)}`);
console.log(`  Yearly revenue:                ${fmt(yearlyRevenue)}`);
console.log('');

console.log('Margin shape:');
const monthlyTotal = infraMonthlyTotal + aiYearly / 12;
const monthlyMargin = monthlyRevenue - monthlyTotal;
console.log(`  Total cost / month (infra+AI): ${fmt(monthlyTotal)}`);
console.log(`  Gross margin:                  ${fmt(monthlyMargin)} (${pct(monthlyMargin, monthlyRevenue)})`);
console.log(`  AI as % of revenue:            ${pct(aiYearly / 12, monthlyRevenue)} (master plan target: <30%)`);
console.log(`  Per customer infra+AI:         ${fmt(monthlyTotal / scale.customers)}`);
console.log(`  Per customer revenue:          ${fmt(perCustomerMonthly)}`);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

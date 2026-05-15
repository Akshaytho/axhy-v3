#!/usr/bin/env node
/**
 * Generator for the handoff/generated/ outputs.
 *
 * Reads canonical sources:
 *   handoff/execution-state/*.md
 *   handoff/workflow-maps/*.md
 *   git metadata
 *
 * Writes:
 *   handoff/generated/app-workflow-state.json  — machine-readable agent context
 *   handoff/generated/app-workflow-dashboard.html — single-file human dashboard
 *
 * Rules (per execution-state/INDEX.md rules 6–15 + workflow-maps/INDEX.md):
 *   * canonical markdown is the source of truth; this script NEVER edits it.
 *   * outputs are read-only; never hand-maintained.
 *   * regenerate on every workflow-truth change in the same work session.
 *
 * Run:  node handoff/scripts/build-handoff-artifacts.mjs
 *  or:  pnpm run handoff:build (if wired into package.json)
 *
 * @derives(ADR-0003) — single source of truth for schema; same principle here for workflow state.
 * @derives(master-plan §G) — HR control plane / responsibility model lineage of workflow tracking.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const handoff = resolve(repoRoot, 'handoff');
const stateDir = resolve(handoff, 'execution-state');
const mapsDir = resolve(handoff, 'workflow-maps');
const outDir = resolve(handoff, 'generated');

// ---------------------------------------------------------------------------
// Git metadata
// ---------------------------------------------------------------------------
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const sourceCommit = git('rev-parse HEAD');
const sourceBranch = git('rev-parse --abbrev-ref HEAD');
const lastCanonicalCommit = git(
  'log -1 --format=%H -- handoff/execution-state handoff/workflow-maps',
);

// ---------------------------------------------------------------------------
// Parse execution-state persona files
//
// Each persona file has a "## Workflow rows" section, with `### <ID> — <name>`
// subsections, each containing `- **<Field>:** <value>` bullets.
// ---------------------------------------------------------------------------

const personaFiles = [
  { key: 'supervisor', name: 'Ravi', file: 'supervisor-ravi.md' },
  { key: 'worker', name: 'Suresh', file: 'worker-suresh.md' },
  { key: 'hr', name: 'Kavitha', file: 'hr-kavitha.md' },
  { key: 'owner', name: 'Reddy', file: 'owner-reddy.md' },
];

function parsePersonaFile(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const personaScope = (text.match(/^\*\*Persona:\*\*\s*(.+)$/m) || [, ''])[1].trim();
  const surfaces = (text.match(/^\*\*Surface mapping:\*\*\s*([\s\S]+?)\n\n/m) || [, ''])[1]
    .replace(/\s+/g, ' ')
    .trim();

  // workflow rows
  const rowsBlock = text.split('## Workflow rows')[1] || '';
  const rowChunks = rowsBlock.split(/\n---\n/).map((s) => s.trim()).filter(Boolean);
  const workflows = [];
  for (const chunk of rowChunks) {
    const heading = (chunk.match(/^###\s+(.+)/m) || [, ''])[1].trim();
    if (!heading) continue;
    // Parse "ID — Name (...)" — keep the trailing parenthetical too
    const idMatch = heading.match(/^([A-Z]-?\d+|[A-Z]\d+|\w[\w-]*)\s+—\s+(.*)/);
    const id = idMatch ? idMatch[1] : heading.split('—')[0].trim();
    const name = idMatch ? idMatch[2].trim() : heading;

    const get = (label) => {
      const re = new RegExp(`\\*\\*${label}:\\*\\*\\s+([^\n]+(?:\\n(?!- \\*\\*)[^\n]*)*)`, 'm');
      const m = chunk.match(re);
      return m ? m[1].trim() : null;
    };

    workflows.push({
      id,
      name,
      design_verdict: get('Design verdict'),
      implementation_state: get('Implementation state'),
      verification_state: get('Verification state'),
      what_works_now: get('What works now'),
      what_does_not_work_yet: get('What does not work yet'),
      file_refs: get('Files / tests / commit refs'),
      current_owner: get('Current owner / current slice'),
      next_step: get('Next required step'),
    });
  }
  return { personaScope, surfaces, workflows };
}

// Pull simple metadata + journey list from workflow-maps persona file
function parseWorkflowMap(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const journeys = [];
  const journeyRe = /^##\s+Journey\s+\d+\s+—\s+(.+?)\n/gm;
  let m;
  while ((m = journeyRe.exec(text)) !== null) journeys.push(m[1].trim());
  return { journeys, hasMermaid: /```mermaid/.test(text) };
}

// ---------------------------------------------------------------------------
// Parse combined.md
// ---------------------------------------------------------------------------
function parseCombined() {
  const text = readFileSync(resolve(stateDir, 'combined.md'), 'utf8');
  // tally lines like "- END_TO_END: 3"
  const tally = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^-\s*([A-Z_]+):\s*(\d+)/);
    if (m) tally[m[1]] = Number(m[2]);
  }
  return { tally };
}

function parseCombinedSystem() {
  const text = readFileSync(resolve(mapsDir, 'combined-system.md'), 'utf8');
  const sequences = [];
  const re = /^##\s+Sequence\s+\d+\s+—\s+(.+?)\n/gm;
  let m;
  while ((m = re.exec(text)) !== null) sequences.push(m[1].trim());
  return { sequences };
}

// ---------------------------------------------------------------------------
// Build personas section
// ---------------------------------------------------------------------------
const personas = {};
for (const p of personaFiles) {
  const stateParsed = parsePersonaFile(resolve(stateDir, p.file));
  const mapsFile = resolve(mapsDir, p.file);
  let mapsParsed = { journeys: [], hasMermaid: false };
  try {
    mapsParsed = parseWorkflowMap(mapsFile);
  } catch {}
  personas[p.key] = {
    name: p.name,
    scope: stateParsed.personaScope,
    surfaces: stateParsed.surfaces,
    workflows: stateParsed.workflows,
    journeys: mapsParsed.journeys,
    has_workflow_map: mapsParsed.hasMermaid,
    workflow_count: stateParsed.workflows.length,
    state_distribution: tallyStates(stateParsed.workflows),
  };
}

function tallyStates(workflows) {
  const t = { BUILT: 0, PARTIAL: 0, WIP: 0, STUBBED: 0, NOT_STARTED: 0, BLOCKED: 0 };
  for (const w of workflows) {
    const s = (w.implementation_state || '').match(/BUILT|PARTIAL|WIP|STUBBED|NOT_STARTED|BLOCKED/);
    if (s && t[s[0]] !== undefined) t[s[0]]++;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Active slice — pulled from STATUS.md / NEXT_SESSION.md
// ---------------------------------------------------------------------------
function activeSlice() {
  try {
    const status = readFileSync(resolve(handoff, 'STATUS.md'), 'utf8');
    const m = status.match(/\*\*Active phase:\*\*\s*\*\*(.+?)\.\*\*/);
    return m ? m[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

const combinedTally = parseCombined().tally;
const sequences = parseCombinedSystem().sequences;

// ---------------------------------------------------------------------------
// Staleness check
// ---------------------------------------------------------------------------
function isStale() {
  if (!lastCanonicalCommit || !sourceCommit) return false;
  return lastCanonicalCommit !== sourceCommit;
}

// ---------------------------------------------------------------------------
// Build the JSON
// ---------------------------------------------------------------------------
const generatedAt = new Date().toISOString();
const json = {
  schema_version: 1,
  metadata: {
    last_updated_at: generatedAt,
    source_commit: sourceCommit,
    source_branch: sourceBranch,
    last_canonical_commit: lastCanonicalCommit,
    staleness_warning: isStale()
      ? 'Generated output may be stale — canonical sources updated more recently than this generation.'
      : null,
    active_slice: activeSlice(),
    generated_from: [
      'handoff/execution-state/*.md',
      'handoff/workflow-maps/*.md',
      'handoff/STATUS.md',
    ],
  },
  personas,
  combined: {
    tally: combinedTally,
    sequence_diagrams: sequences,
  },
};

writeFileSync(resolve(outDir, 'app-workflow-state.json'), JSON.stringify(json, null, 2) + '\n');

// ---------------------------------------------------------------------------
// Build the HTML dashboard
// ---------------------------------------------------------------------------
function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function stateBadge(state) {
  const map = {
    BUILT: ['#1e8e3e', '#fff'],
    PARTIAL: ['#f5b400', '#000'],
    WIP: ['#1a73e8', '#fff'],
    STUBBED: ['#bdbdbd', '#000'],
    NOT_STARTED: ['#e53935', '#fff'],
    BLOCKED: ['#8e24aa', '#fff'],
  };
  const norm = (state || '').match(/BUILT|PARTIAL|WIP|STUBBED|NOT_STARTED|BLOCKED/);
  const key = norm ? norm[0] : 'STUBBED';
  const [bg, fg] = map[key];
  return `<span class="badge" style="background:${bg};color:${fg};">${key}</span>`;
}

function verifBadge(v) {
  const map = {
    UNVERIFIED: '#999',
    LOCAL: '#666',
    REAL_DB: '#1e8e3e',
    PROD_APPLIED: '#0b6624',
  };
  const norm = (v || '').match(/UNVERIFIED|LOCAL|REAL_DB|PROD_APPLIED/);
  const key = norm ? norm[0] : 'UNVERIFIED';
  return `<span class="badge" style="background:${map[key]};color:#fff;">${key}</span>`;
}

function personaCard(key, p) {
  const rows = p.workflows
    .map(
      (w) => `
    <tr>
      <td><strong>${escape(w.id)}</strong></td>
      <td>${escape(w.name)}</td>
      <td>${escape(w.design_verdict || '—')}</td>
      <td>${stateBadge(w.implementation_state)}</td>
      <td>${verifBadge(w.verification_state)}</td>
      <td class="cell-narrow">${escape(w.next_step || '—')}</td>
    </tr>`,
    )
    .join('');
  const dist = p.state_distribution;
  const journeys = (p.journeys || []).map((j) => `<li>${escape(j)}</li>`).join('') || '<li><em>no journeys defined in workflow-maps yet</em></li>';
  return `
  <section id="persona-${key}" class="persona">
    <h2>${escape(p.name)} <small>(${p.workflow_count} workflows)</small></h2>
    <p class="scope">${escape(p.scope)}</p>
    <p class="surfaces">${escape(p.surfaces)}</p>
    <div class="dist">
      ${Object.entries(dist).map(([k, v]) => `<span class="dist-chip">${k}: <strong>${v}</strong></span>`).join('')}
    </div>
    <h3>Journeys (from workflow-maps)</h3>
    <ol>${journeys}</ol>
    <h3>Workflow rows</h3>
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>Design</th><th>Impl</th><th>Verif</th><th>Next step</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Axhy v3 — Handoff Workflow Dashboard</title>
  <style>
    :root {
      --fg: #1c1c1c; --bg: #fafafa; --card: #fff; --border: #e0e0e0;
      --muted: #666; --accent: #1a73e8;
    }
    @media (prefers-color-scheme: dark) {
      :root { --fg: #e0e0e0; --bg: #1c1c1c; --card: #2a2a2a; --border: #444; --muted: #aaa; }
    }
    body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
           color: var(--fg); background: var(--bg); margin: 0; padding: 0; }
    header { padding: 16px 24px; background: var(--card); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
    header h1 { margin: 0 0 8px; font-size: 20px; }
    header .meta { font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 12px; }
    header .stale { color: #c62828; font-weight: 600; }
    nav { padding: 8px 24px; background: var(--card); border-bottom: 1px solid var(--border); display: flex; gap: 12px; flex-wrap: wrap; }
    nav a { color: var(--accent); text-decoration: none; padding: 4px 12px; border-radius: 4px; }
    nav a:hover { background: var(--bg); }
    main { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .persona { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .persona h2 small { color: var(--muted); font-size: 14px; font-weight: normal; }
    .scope, .surfaces { color: var(--muted); margin: 4px 0; }
    .dist { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .dist-chip { padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; font-size: 12px; }
    h3 { margin-top: 16px; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
    .cell-narrow { max-width: 320px; }
    .summary { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .summary-cell { padding: 16px; background: var(--bg); border-radius: 6px; text-align: center; }
    .summary-cell .value { font-size: 28px; font-weight: 700; }
    .summary-cell .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .footer-note { font-size: 12px; color: var(--muted); padding: 16px 24px; }
    .footer-note code { background: var(--bg); padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <header>
    <h1>Axhy v3 — Handoff Workflow Dashboard</h1>
    <div class="meta">
      <span>Generated <strong>${generatedAt}</strong></span>
      <span>Commit <code>${sourceCommit.slice(0, 8)}</code></span>
      <span>Branch <code>${sourceBranch}</code></span>
      <span>Active slice: <strong>${escape(activeSlice())}</strong></span>
      ${isStale() ? `<span class="stale">⚠ STALE — canonical sources updated since this generation. Re-run <code>pnpm run handoff:build</code>.</span>` : ''}
    </div>
  </header>
  <nav>
    <a href="#summary">Summary</a>
    ${personaFiles.map((p) => `<a href="#persona-${p.key}">${p.name}</a>`).join('')}
    <a href="#combined">Combined / cross-persona</a>
  </nav>
  <main>
    <section id="summary" class="summary">
      <h2>Combined tally (29 workflows total)</h2>
      <div class="summary-grid">
        ${Object.entries(combinedTally).map(([k, v]) => `
          <div class="summary-cell">
            <div class="value">${v}</div>
            <div class="label">${k.replace(/_/g, ' ')}</div>
          </div>`).join('')}
      </div>
      <h3>Cross-persona sequence diagrams (in workflow-maps/combined-system.md)</h3>
      <ol>${sequences.map((s) => `<li>${escape(s)}</li>`).join('')}</ol>
    </section>

    ${personaFiles.map((p) => personaCard(p.key, personas[p.key])).join('')}

    <section id="combined" class="summary">
      <h2>Where to find more</h2>
      <p>This dashboard is a generated read-only view. To edit any of this, edit the canonical markdown:</p>
      <ul>
        <li><code>handoff/execution-state/*.md</code> — build state per persona + combined.</li>
        <li><code>handoff/workflow-maps/*.md</code> — journey flowcharts + cross-persona sequences + ER diagram.</li>
        <li><code>handoff/execution-state/INDEX.md</code> — strict enums + 15 failure-mode rules.</li>
      </ul>
      <p>Regenerate with: <code>node handoff/scripts/build-handoff-artifacts.mjs</code></p>
    </section>
  </main>
  <p class="footer-note">
    Generated from <code>handoff/execution-state/</code> + <code>handoff/workflow-maps/</code> + git.
    Never edit this file directly — it's a derived artifact (per failure-mode rule 6 in <code>execution-state/INDEX.md</code>).
  </p>
</body>
</html>
`;

writeFileSync(resolve(outDir, 'app-workflow-dashboard.html'), html);

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
const distSummary = Object.entries(json.personas)
  .map(([k, p]) => `  ${k}: ${Object.entries(p.state_distribution).map(([s, n]) => `${s}=${n}`).join(' ')}`)
  .join('\n');

console.log('handoff artifacts generated:');
console.log(`  ${resolve(outDir, 'app-workflow-state.json')}`);
console.log(`  ${resolve(outDir, 'app-workflow-dashboard.html')}`);
console.log('persona state distribution:');
console.log(distSummary);
console.log(`source commit: ${sourceCommit.slice(0, 8)} on ${sourceBranch}`);
console.log(`active slice: ${activeSlice()}`);
if (isStale()) {
  console.log('⚠ STALE — canonical sources newer than current HEAD');
}

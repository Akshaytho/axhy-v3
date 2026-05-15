#!/usr/bin/env node
/**
 * Generator for the handoff/generated/ outputs.
 *
 * Reads canonical sources:
 *   handoff/execution-state/*.md  — workflow rows (build state)
 *   handoff/workflow-maps/*.md    — journey flowcharts (Mermaid)
 *   handoff/STATUS.md             — active slice
 *   git metadata
 *
 * Writes:
 *   handoff/generated/app-workflow-state.json     — machine-readable agent context
 *   handoff/generated/app-workflow-dashboard.html — single-file human dashboard
 *                                                   with embedded Mermaid diagrams
 *
 * Per execution-state/INDEX.md rules 6–15:
 *   * canonical markdown is the source of truth; this script NEVER edits it.
 *   * outputs are read-only; never hand-maintained.
 *   * regenerate on every workflow-truth change in the same work session.
 *
 * Run:  node handoff/scripts/build-handoff-artifacts.mjs
 *  or:  pnpm run handoff:build
 *
 * @derives(ADR-0003) — single source of truth principle (same here for workflow state).
 * @derives(master-plan §G) — HR control plane / responsibility model.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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
// Persona registry
// ---------------------------------------------------------------------------
const personaFiles = [
  { key: 'supervisor', name: 'Ravi (Supervisor)', file: 'supervisor-ravi.md' },
  { key: 'worker', name: 'Suresh (Worker)', file: 'worker-suresh.md' },
  { key: 'hr', name: 'Kavitha (HR)', file: 'hr-kavitha.md' },
  { key: 'owner', name: 'Reddy (Owner)', file: 'owner-reddy.md' },
];

// ---------------------------------------------------------------------------
// Mermaid block extraction
// ---------------------------------------------------------------------------
function extractAllMermaidBlocks(text) {
  const re = /```mermaid\n([\s\S]+?)\n```/g;
  const blocks = [];
  let m;
  while ((m = re.exec(text)) !== null) blocks.push({ source: m[1], offset: m.index });
  return blocks;
}

/**
 * For workflow-maps persona files, find each ## Journey N — heading and pair it
 * with the next Mermaid block + a short description.
 */
function parseWorkflowMapPersona(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const journeys = [];

  // Top-level overview (the persona horizon diagram before any "## Journey" heading).
  const firstJourneyIdx = text.search(/^##\s+Journey\s+\d+/m);
  const headBlock = firstJourneyIdx > 0 ? text.slice(0, firstJourneyIdx) : text;
  const headMermaid = extractAllMermaidBlocks(headBlock);
  const headerDiagrams = headMermaid.map((b) => b.source);

  // The current-slice focus block, if present (## Current-slice focus).
  let currentSlice = null;
  const csMatch = headBlock.match(/##\s+Current-slice focus\n([\s\S]+?)(?=\n##\s+Journey|\Z)/);
  if (csMatch) {
    const csBlocks = extractAllMermaidBlocks(csMatch[1]);
    currentSlice = {
      description: csMatch[1]
        .replace(/```mermaid[\s\S]+?```/g, '')
        .trim()
        .slice(0, 800),
      diagrams: csBlocks.map((b) => b.source),
    };
  }

  // Parse journeys by splitting on the heading. Robust against the next
  // section being Spec lineage, Recent commits, or EOF.
  const journeySections = text.split(/\n##\s+Journey\s+/).slice(1);
  for (const section of journeySections) {
    const headerMatch = section.match(/^(\d+)\s+—\s+(.+?)\n/);
    if (!headerMatch) continue;
    const num = Number(headerMatch[1]);
    const title = headerMatch[2].trim();
    // Body is everything until the next `## ` at column 0.
    const rest = section.slice(headerMatch[0].length);
    const nextHeadingIdx = rest.search(/\n##\s/);
    const body = nextHeadingIdx >= 0 ? rest.slice(0, nextHeadingIdx) : rest;

    const mermaidMatch = body.match(/```mermaid\n([\s\S]+?)\n```/);
    let description = '';
    let diagram = null;
    if (mermaidMatch) {
      description = body.slice(0, mermaidMatch.index).replace(/^\s*\n+/, '').split('\n\n')[0].trim();
      diagram = mermaidMatch[1];
    }
    const afterMermaid = mermaidMatch
      ? body.slice(mermaidMatch.index + mermaidMatch[0].length)
      : '';
    const notes = afterMermaid.trim().slice(0, 1000);

    journeys.push({ num, title, description, diagram, notes });
  }

  return { headerDiagrams, currentSlice, journeys };
}

/**
 * combined-system.md: each ## Sequence N — heading + its Mermaid.
 */
function parseCombinedSystem() {
  const text = readFileSync(resolve(mapsDir, 'combined-system.md'), 'utf8');
  const sequences = [];
  const sections = text.split(/\n##\s+Sequence\s+/).slice(1);
  for (const section of sections) {
    const headerMatch = section.match(/^(\d+)\s+—\s+(.+?)\n/);
    if (!headerMatch) continue;
    const num = Number(headerMatch[1]);
    const title = headerMatch[2].trim();
    const rest = section.slice(headerMatch[0].length);
    const nextHeadingIdx = rest.search(/\n##\s/);
    const body = nextHeadingIdx >= 0 ? rest.slice(0, nextHeadingIdx) : rest;
    const mermaidMatch = body.match(/```mermaid\n([\s\S]+?)\n```/);
    const description = mermaidMatch
      ? body.slice(0, mermaidMatch.index).replace(/^\s*\n+/, '').split('\n\n')[0].trim()
      : '';
    const diagram = mermaidMatch ? mermaidMatch[1] : null;
    const afterMermaid = mermaidMatch
      ? body.slice(mermaidMatch.index + mermaidMatch[0].length)
      : '';
    const notes = afterMermaid.trim().slice(0, 600);
    sequences.push({ num, title, description, diagram, notes });
  }
  return sequences;
}

/**
 * data-model.md: extract ER diagram (first Mermaid) + R/W matrix table.
 */
function parseDataModel() {
  const text = readFileSync(resolve(mapsDir, 'data-model.md'), 'utf8');
  const allMermaid = extractAllMermaidBlocks(text);
  const erDiagram = allMermaid.length > 0 ? allMermaid[0].source : null;

  // R/W matrix table: long markdown table with rows starting with `| <workflow> |`.
  const matrixSection = text.match(/##\s+Tables-by-workflow[\s\S]+?(?=\n##\s)/);
  let matrixHtml = '';
  if (matrixSection) {
    matrixHtml = renderMarkdownTable(matrixSection[0]);
  }

  // Invariants table
  const invariantsSection = text.match(/##\s+Invariants the schema enforces[\s\S]+?(?=\n##\s)/);
  const invariantsHtml = invariantsSection ? renderMarkdownTable(invariantsSection[0]) : '';

  // Audit emitters table
  const auditSection = text.match(/##\s+AuditEvent kinds emitted by each implementation[\s\S]+?(?=\n##\s)/);
  const auditHtml = auditSection ? renderMarkdownTable(auditSection[0]) : '';

  // Outbox table
  const outboxSection = text.match(/##\s+Outbox topics emitted today[\s\S]+?(?=\n##\s)/);
  const outboxHtml = outboxSection ? renderMarkdownTable(outboxSection[0]) : '';

  // Migration timeline
  const migrationSection = text.match(/##\s+Migration timeline[\s\S]+?(?=\n##\s|\Z)/);
  const migrationHtml = migrationSection ? renderMarkdownTable(migrationSection[0]) : '';

  return { erDiagram, matrixHtml, invariantsHtml, auditHtml, outboxHtml, migrationHtml };
}

function renderMarkdownTable(section) {
  const lines = section.split('\n').map((l) => l.trim());
  const tableStart = lines.findIndex((l) => l.startsWith('|'));
  if (tableStart < 0) return '';
  let html = '<table>';
  let row = 0;
  for (let i = tableStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) {
      if (row > 0) break;
      else continue;
    }
    if (/^\|\s*-+/.test(line)) continue; // separator row
    const cells = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    const tag = row === 0 ? 'th' : 'td';
    if (row === 0) html += '<thead><tr>';
    if (row === 1) html += '</thead><tbody><tr>';
    if (row > 1) html += '<tr>';
    for (const c of cells) html += `<${tag}>${renderInline(c)}</${tag}>`;
    html += '</tr>';
    row++;
  }
  html += '</tbody></table>';
  return html;
}

function renderInline(s) {
  return escape(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// ---------------------------------------------------------------------------
// Execution-state persona parser (build-state ledger rows)
// ---------------------------------------------------------------------------
function parseStatePersona(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const personaScope = (text.match(/^\*\*Persona:\*\*\s*(.+)$/m) || [, ''])[1].trim();
  const surfaces = (text.match(/^\*\*Surface mapping:\*\*\s*([\s\S]+?)\n\n/m) || [, ''])[1]
    .replace(/\s+/g, ' ')
    .trim();
  const rowsBlock = text.split('## Workflow rows')[1] || '';
  const chunks = rowsBlock.split(/\n---\n/).map((s) => s.trim()).filter(Boolean);
  const workflows = [];
  for (const chunk of chunks) {
    const heading = (chunk.match(/^###\s+(.+)/m) || [, ''])[1].trim();
    if (!heading) continue;
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

function tallyStates(workflows) {
  const t = { BUILT: 0, PARTIAL: 0, WIP: 0, STUBBED: 0, NOT_STARTED: 0, BLOCKED: 0 };
  for (const w of workflows) {
    const s = (w.implementation_state || '').match(/BUILT|PARTIAL|WIP|STUBBED|NOT_STARTED|BLOCKED/);
    if (s && t[s[0]] !== undefined) t[s[0]]++;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Combined tally from execution-state/combined.md
// ---------------------------------------------------------------------------
function parseCombinedTally() {
  const text = readFileSync(resolve(stateDir, 'combined.md'), 'utf8');
  const tally = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^-\s*([A-Z_]+):\s*(\d+)/);
    if (m) tally[m[1]] = Number(m[2]);
  }
  return tally;
}

function activeSlice() {
  try {
    const status = readFileSync(resolve(handoff, 'STATUS.md'), 'utf8');
    const m = status.match(/\*\*Active phase:\*\*\s*\*\*(.+?)\.\*\*/);
    return m ? m[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

function isStale() {
  return Boolean(lastCanonicalCommit) && Boolean(sourceCommit) && lastCanonicalCommit !== sourceCommit;
}

// ---------------------------------------------------------------------------
// Build personas (state + maps merged)
// ---------------------------------------------------------------------------
const personas = {};
for (const p of personaFiles) {
  const state = parseStatePersona(resolve(stateDir, p.file));
  let maps = { headerDiagrams: [], currentSlice: null, journeys: [] };
  try {
    maps = parseWorkflowMapPersona(resolve(mapsDir, p.file));
  } catch {
    /* file may not exist yet */
  }
  personas[p.key] = {
    name: p.name,
    scope: state.personaScope,
    surfaces: state.surfaces,
    workflows: state.workflows,
    workflow_count: state.workflows.length,
    state_distribution: tallyStates(state.workflows),
    journeys: maps.journeys,
    header_diagrams: maps.headerDiagrams,
    current_slice: maps.currentSlice,
  };
}

const sequences = parseCombinedSystem();
const combinedTally = parseCombinedTally();
const dataModel = parseDataModel();
const generatedAt = new Date().toISOString();

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------
const json = {
  schema_version: 2,
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
  personas: Object.fromEntries(
    Object.entries(personas).map(([k, p]) => [
      k,
      {
        name: p.name,
        scope: p.scope,
        surfaces: p.surfaces,
        workflow_count: p.workflow_count,
        state_distribution: p.state_distribution,
        workflows: p.workflows,
        journeys: p.journeys.map((j) => ({
          num: j.num,
          title: j.title,
          description: j.description,
          has_diagram: Boolean(j.diagram),
        })),
        has_current_slice_focus: Boolean(p.current_slice),
      },
    ]),
  ),
  combined: {
    tally: combinedTally,
    sequence_diagrams: sequences.map((s) => ({ num: s.num, title: s.title, has_diagram: Boolean(s.diagram) })),
  },
  data_model_has_er: Boolean(dataModel.erDiagram),
};
writeFileSync(resolve(outDir, 'app-workflow-state.json'), JSON.stringify(json, null, 2) + '\n');

// ---------------------------------------------------------------------------
// HTML output — embedded Mermaid via CDN
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
  const map = { UNVERIFIED: '#999', LOCAL: '#666', REAL_DB: '#1e8e3e', PROD_APPLIED: '#0b6624' };
  const norm = (v || '').match(/UNVERIFIED|LOCAL|REAL_DB|PROD_APPLIED/);
  const key = norm ? norm[0] : 'UNVERIFIED';
  return `<span class="badge" style="background:${map[key]};color:#fff;">${key}</span>`;
}

function diagramBlock(source, caption) {
  if (!source) return '';
  // Each diagram gets a unique id so mermaid renders them all on init.
  return `
    <figure class="diagram">
      ${caption ? `<figcaption>${escape(caption)}</figcaption>` : ''}
      <pre class="mermaid">${escape(source)}</pre>
    </figure>`;
}

function workflowTable(workflows, mapsHref) {
  const rows = workflows
    .map(
      (w) => `
    <tr>
      <td><strong>${escape(w.id)}</strong></td>
      <td>${escape(w.name)}</td>
      <td class="small">${escape(w.design_verdict || '—')}</td>
      <td>${stateBadge(w.implementation_state)}</td>
      <td>${verifBadge(w.verification_state)}</td>
      <td class="cell-narrow small">${escape(w.next_step || '—')}</td>
    </tr>`,
    )
    .join('');
  return `
    <table class="workflow-table">
      <thead><tr><th>ID</th><th>Workflow</th><th>Design</th><th>Impl</th><th>Verif</th><th>Next step</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${mapsHref ? `<p class="source-link">Edit canonical source: <a href="${mapsHref}">${mapsHref}</a></p>` : ''}`;
}

function personaSection(key, p) {
  const headerDiagram = p.header_diagrams[0]
    ? diagramBlock(p.header_diagrams[0], 'Overview — journey-level state')
    : '';

  const currentSlice = p.current_slice
    ? `
      <div class="current-slice">
        <h3>🟦 Current slice focus</h3>
        <p class="small">${renderInline(p.current_slice.description || '')}</p>
        ${(p.current_slice.diagrams || []).map((d) => diagramBlock(d, 'Active slice path')).join('')}
      </div>`
    : '';

  const journeys = p.journeys
    .map(
      (j) => `
      <details class="journey" ${j.num <= 2 ? 'open' : ''}>
        <summary><strong>Journey ${j.num} — ${escape(j.title)}</strong></summary>
        ${j.description ? `<p class="small">${renderInline(j.description)}</p>` : ''}
        ${diagramBlock(j.diagram, '')}
        ${j.notes ? `<div class="journey-notes">${renderInline(j.notes).replace(/\n\n+/g, '</p><p>').replace(/^(.)/, '<p>$1').replace(/(.)$/, '$1</p>')}</div>` : ''}
      </details>`,
    )
    .join('');

  const dist = p.state_distribution;
  const distChips = Object.entries(dist)
    .map(([k, v]) => `<span class="dist-chip dist-${k}">${k}: <strong>${v}</strong></span>`)
    .join('');

  const stateHref = `../execution-state/${personaFiles.find((pp) => pp.key === key).file}`;
  const mapsHref = `../workflow-maps/${personaFiles.find((pp) => pp.key === key).file}`;

  return `
  <section id="persona-${key}" class="persona">
    <h2>${escape(p.name)} <small>(${p.workflow_count} workflows)</small></h2>
    <p class="scope small">${escape(p.scope)}</p>
    <p class="surfaces small">${escape(p.surfaces)}</p>
    <div class="dist">${distChips}</div>

    ${headerDiagram}
    ${currentSlice}

    <h3>Journey flowcharts</h3>
    ${journeys || '<p class="small empty">No journeys defined in workflow-maps for this persona.</p>'}

    <h3>Workflow build-state table</h3>
    ${workflowTable(p.workflows, null)}

    <p class="source-link small">
      Sources:
      <a href="${stateHref}">execution-state/${personaFiles.find((pp) => pp.key === key).file}</a>
      ·
      <a href="${mapsHref}">workflow-maps/${personaFiles.find((pp) => pp.key === key).file}</a>
    </p>
  </section>`;
}

function combinedSection() {
  const seq = sequences
    .map(
      (s) => `
      <details class="journey" ${s.num <= 2 ? 'open' : ''}>
        <summary><strong>Sequence ${s.num} — ${escape(s.title)}</strong></summary>
        ${s.description ? `<p class="small">${renderInline(s.description)}</p>` : ''}
        ${diagramBlock(s.diagram, '')}
        ${s.notes ? `<div class="journey-notes small">${renderInline(s.notes)}</div>` : ''}
      </details>`,
    )
    .join('');

  return `
  <section id="combined" class="persona">
    <h2>Combined / Cross-persona end-to-end</h2>
    <p class="scope small">Sequence diagrams for every cross-persona workflow. Each shows the implementation horizon — where the system stops working today.</p>

    <div class="summary-grid">
      ${Object.entries(combinedTally)
        .map(
          ([k, v]) => `
        <div class="summary-cell">
          <div class="value">${v}</div>
          <div class="label">${k.replace(/_/g, ' ')}</div>
        </div>`,
        )
        .join('')}
    </div>

    <h3>Cross-persona sequence diagrams</h3>
    ${seq || '<p class="empty">No sequences in workflow-maps/combined-system.md.</p>'}

    <p class="source-link small">
      Sources:
      <a href="../execution-state/combined.md">execution-state/combined.md</a>
      ·
      <a href="../workflow-maps/combined-system.md">workflow-maps/combined-system.md</a>
    </p>
  </section>`;
}

function dataModelSection() {
  return `
  <section id="data-model" class="persona">
    <h2>Data model — how the tables connect underneath</h2>
    <p class="scope small">Entity-relationship diagram for the 23 axhy tables + workflow read/write/audit matrix + invariants + emitters.</p>

    <h3>Entity-relationship diagram</h3>
    ${dataModel.erDiagram ? diagramBlock(dataModel.erDiagram, '23 axhy tables + foreign keys + cascade rules') : '<p class="empty">No ER diagram in data-model.md.</p>'}

    <h3>Tables-by-workflow R/W/A matrix</h3>
    ${dataModel.matrixHtml || '<p class="empty">Matrix not parseable.</p>'}

    <h3>Invariants the schema enforces (DB level)</h3>
    ${dataModel.invariantsHtml || '<p class="empty">Section not parseable.</p>'}

    <h3>AuditEvent kinds emitted today</h3>
    ${dataModel.auditHtml || '<p class="empty">Section not parseable.</p>'}

    <h3>Outbox topics emitted today</h3>
    ${dataModel.outboxHtml || '<p class="empty">Section not parseable.</p>'}

    <h3>Migration timeline (chain order)</h3>
    ${dataModel.migrationHtml || '<p class="empty">Section not parseable.</p>'}

    <p class="source-link small">
      Source: <a href="../workflow-maps/data-model.md">workflow-maps/data-model.md</a>
    </p>
  </section>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Axhy v3 — Handoff Architecture Dashboard</title>
  <style>
    :root {
      --fg: #1c1c1c; --bg: #fafafa; --card: #fff; --border: #e0e0e0;
      --muted: #666; --accent: #1a73e8;
    }
    @media (prefers-color-scheme: dark) {
      :root { --fg: #e0e0e0; --bg: #1c1c1c; --card: #2a2a2a; --border: #444; --muted: #aaa; }
    }
    * { box-sizing: border-box; }
    body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
           color: var(--fg); background: var(--bg); margin: 0; padding: 0; }
    header { padding: 16px 24px; background: var(--card); border-bottom: 1px solid var(--border);
             position: sticky; top: 0; z-index: 10; }
    header h1 { margin: 0 0 8px; font-size: 18px; }
    header .meta { font-size: 11px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 12px; }
    header .stale { color: #c62828; font-weight: 600; }
    nav { padding: 8px 24px; background: var(--card); border-bottom: 1px solid var(--border);
          display: flex; gap: 8px; flex-wrap: wrap; overflow-x: auto; }
    nav a { color: var(--accent); text-decoration: none; padding: 4px 12px; border-radius: 4px;
            white-space: nowrap; font-size: 13px; }
    nav a:hover { background: var(--bg); }
    main { padding: 24px; max-width: 1400px; margin: 0 auto; }
    h2 { margin: 0 0 8px; font-size: 22px; }
    h2 small { color: var(--muted); font-size: 14px; font-weight: normal; }
    h3 { margin: 16px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
    p { margin: 4px 0; }
    .small { font-size: 12px; color: var(--muted); }
    .empty { font-style: italic; color: var(--muted); }
    .persona { background: var(--card); border: 1px solid var(--border); border-radius: 8px;
               padding: 20px; margin-bottom: 24px; }
    .dist { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .dist-chip { padding: 4px 10px; background: var(--bg); border: 1px solid var(--border);
                 border-radius: 12px; font-size: 11px; }
    .dist-BUILT { border-color: #1e8e3e; }
    .dist-PARTIAL { border-color: #f5b400; }
    .dist-WIP { border-color: #1a73e8; }
    .dist-NOT_STARTED { border-color: #e53935; }
    .dist-BLOCKED { border-color: #8e24aa; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px;
             font-weight: 700; letter-spacing: 0.5px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 12px 0; }
    .summary-cell { padding: 16px; background: var(--bg); border-radius: 6px; text-align: center; }
    .summary-cell .value { font-size: 28px; font-weight: 700; }
    .summary-cell .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .diagram { margin: 12px 0; padding: 16px; background: var(--bg); border-radius: 6px;
               border: 1px solid var(--border); overflow-x: auto; }
    .diagram figcaption { font-size: 11px; color: var(--muted); margin-bottom: 8px;
                          text-transform: uppercase; letter-spacing: 0.5px; }
    .mermaid { background: transparent; }
    details.journey { margin: 8px 0; padding: 12px; background: var(--bg); border-radius: 6px;
                      border: 1px solid var(--border); }
    details.journey summary { cursor: pointer; font-size: 14px; padding: 4px 0; }
    details.journey[open] summary { margin-bottom: 8px; }
    .journey-notes { font-size: 12px; color: var(--muted); margin-top: 8px; }
    .current-slice { background: rgba(26,115,232,0.08); border-left: 4px solid #1a73e8;
                     padding: 12px 16px; margin: 12px 0; border-radius: 4px; }
    .current-slice h3 { margin-top: 0; color: #1a73e8; }
    .workflow-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    .workflow-table th, .workflow-table td { text-align: left; padding: 6px 10px;
                                             border-bottom: 1px solid var(--border); vertical-align: top; }
    .workflow-table th { font-weight: 600; color: var(--muted); font-size: 10px;
                         text-transform: uppercase; letter-spacing: 0.5px; }
    .cell-narrow { max-width: 320px; }
    .source-link { font-size: 11px; color: var(--muted); margin-top: 12px; }
    .source-link a { color: var(--accent); }
    code { background: var(--bg); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    table th, table td { text-align: left; padding: 6px 10px;
                         border-bottom: 1px solid var(--border); vertical-align: top; }
    table th { font-weight: 600; color: var(--muted); font-size: 10px;
               text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <header>
    <h1>Axhy v3 — Handoff Architecture Dashboard</h1>
    <div class="meta">
      <span>Generated <strong>${generatedAt}</strong></span>
      <span>Commit <code>${sourceCommit.slice(0, 8)}</code></span>
      <span>Branch <code>${sourceBranch}</code></span>
      <span>Active slice: <strong>${escape(activeSlice())}</strong></span>
      ${isStale() ? `<span class="stale">⚠ STALE — re-run <code>pnpm run handoff:build</code></span>` : ''}
    </div>
  </header>
  <nav>
    <a href="#summary">Summary</a>
    ${personaFiles.map((p) => `<a href="#persona-${p.key}">${escape(p.name)}</a>`).join('')}
    <a href="#combined">Cross-persona</a>
    <a href="#data-model">Data model</a>
  </nav>
  <main>
    <section id="summary" class="persona">
      <h2>Build-state summary (29 workflows)</h2>
      <div class="summary-grid">
        ${Object.entries(combinedTally).map(([k, v]) => `
          <div class="summary-cell">
            <div class="value">${v}</div>
            <div class="label">${k.replace(/_/g, ' ')}</div>
          </div>`).join('')}
      </div>

      <h3>Per-persona state distribution</h3>
      ${Object.entries(personas).map(([k, p]) => `
        <div class="dist">
          <strong style="min-width:140px;">${escape(p.name)}:</strong>
          ${Object.entries(p.state_distribution).map(([s, n]) => `<span class="dist-chip dist-${s}">${s}: <strong>${n}</strong></span>`).join('')}
        </div>`).join('')}

      <p class="source-link small">
        Sources:
        <a href="../execution-state/INDEX.md">execution-state/INDEX.md</a>
        ·
        <a href="../workflow-maps/INDEX.md">workflow-maps/INDEX.md</a>
        ·
        <a href="../STATUS.md">handoff/STATUS.md</a>
        ·
        <a href="app-workflow-state.json">app-workflow-state.json</a> (machine-readable)
      </p>
    </section>

    ${personaFiles.map((p) => personaSection(p.key, personas[p.key])).join('')}

    ${combinedSection()}

    ${dataModelSection()}

    <section class="persona">
      <h2>How this dashboard stays fresh</h2>
      <p class="small">This file is regenerated from canonical markdown by <code>handoff/scripts/build-handoff-artifacts.mjs</code>. Per execution-state/INDEX.md rule 7: any time canonical sources change, re-run <code>pnpm run handoff:build</code>. Per rule 11: never hand-edit this HTML or the JSON — they are derived artifacts only.</p>
      <p class="small">If you want to add or change a journey diagram, edit the matching <code>handoff/workflow-maps/&lt;persona&gt;.md</code> file. If you want to record a workflow build-state change, edit the matching <code>handoff/execution-state/&lt;persona&gt;.md</code> row. Then regenerate.</p>
    </section>
  </main>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    mermaid.initialize({
      startOnLoad: true,
      theme: isDark ? 'dark' : 'default',
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      sequence: { useMaxWidth: true, actorMargin: 60 },
      er: { useMaxWidth: true },
    });
    // Re-render diagrams inside collapsed <details> when first opened.
    document.querySelectorAll('details.journey').forEach((d) => {
      d.addEventListener('toggle', () => {
        if (d.open) {
          const pre = d.querySelector('pre.mermaid');
          if (pre && !pre.dataset.rendered) {
            mermaid.run({ nodes: [pre] });
            pre.dataset.rendered = '1';
          }
        }
      }, { once: false });
    });
  </script>
</body>
</html>
`;

writeFileSync(resolve(outDir, 'app-workflow-dashboard.html'), html);

// ---------------------------------------------------------------------------
// Done — summary to stdout
// ---------------------------------------------------------------------------
const distSummary = Object.entries(personas)
  .map(([k, p]) => `  ${k}: ${Object.entries(p.state_distribution).map(([s, n]) => `${s}=${n}`).join(' ')} · journeys=${p.journeys.length} · diagrams=${[...p.header_diagrams, ...(p.current_slice?.diagrams || []), ...p.journeys.map((j) => j.diagram).filter(Boolean)].length}`)
  .join('\n');

const totalDiagrams =
  Object.values(personas).reduce(
    (n, p) => n + p.header_diagrams.length + (p.current_slice?.diagrams.length || 0) + p.journeys.filter((j) => j.diagram).length,
    0,
  ) +
  sequences.filter((s) => s.diagram).length +
  (dataModel.erDiagram ? 1 : 0);

console.log('handoff artifacts generated:');
console.log(`  ${resolve(outDir, 'app-workflow-state.json')}`);
console.log(`  ${resolve(outDir, 'app-workflow-dashboard.html')}`);
console.log('persona state distribution + diagram counts:');
console.log(distSummary);
console.log(`combined sequences: ${sequences.length} (with diagram: ${sequences.filter((s) => s.diagram).length})`);
console.log(`data-model ER diagram: ${dataModel.erDiagram ? 'yes' : 'no'}`);
console.log(`total Mermaid diagrams embedded in HTML: ${totalDiagrams}`);
console.log(`source commit: ${sourceCommit.slice(0, 8)} on ${sourceBranch}`);
console.log(`active slice: ${activeSlice()}`);
if (isStale()) console.log('⚠ STALE — canonical sources newer than current HEAD');

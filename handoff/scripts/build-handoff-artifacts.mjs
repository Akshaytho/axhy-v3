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
const ownerDir = resolve(handoff, 'owner-input');
const queueDir = resolve(handoff, 'feature-queue');
const outDir = resolve(handoff, 'generated');

function safeRead(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

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
// IMPORTANT: under the auto-regen pre-commit hook, `git rev-parse HEAD` returns
// the PRIOR commit — the new commit hash does not exist yet at generation time.
// So the values below describe "git state at generation time", which under the
// auto-regen flow is one commit behind the commit that ultimately contains
// these outputs. Field names + dashboard labels are explicit about this.
const generatedAgainstHead = git('rev-parse HEAD');
const generatedAgainstBranch = git('rev-parse --abbrev-ref HEAD');
// Canonical = the markdown sources of truth (NOT the generated outputs).
const CANONICAL_PATHS = 'handoff/execution-state handoff/workflow-maps handoff/owner-input handoff/feature-queue handoff/README.md handoff/STATUS.md handoff/NEXT_SESSION.md';
const GENERATED_PATHS = 'handoff/generated';
const lastCanonicalCommit = git(`log -1 --format=%H -- ${CANONICAL_PATHS}`);
const lastGeneratedCommit = git(`log -1 --format=%H -- ${GENERATED_PATHS}`);
const lastCanonicalCommitDate = Number(git(`log -1 --format=%ct -- ${CANONICAL_PATHS}`)) || 0;
const lastGeneratedCommitDate = Number(git(`log -1 --format=%ct -- ${GENERATED_PATHS}`)) || 0;
// Uncommitted canonical changes are the strongest stale signal.
const uncommittedCanonical = git(`diff --name-only HEAD -- ${CANONICAL_PATHS}`);

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

/**
 * Active slice display value — slice-level, not phase-level.
 *
 * Per friend's verification (2026-05-15 evening): header + Current Slice
 * callout must agree. owner-input/active-slice.md is the slice-level
 * canonical source. STATUS.md is phase-level and stays as a fallback only
 * if the active-slice file is missing.
 */
function activeSlice() {
  const aSlice = parseActiveSlice();
  if (aSlice['Slice name']) {
    const name = aSlice['Slice name'].replace(/`/g, '').trim();
    const status = (aSlice['Status'] || '').replace(/`/g, '').trim();
    return status ? `${name} · ${status}` : name;
  }
  try {
    const status = readFileSync(resolve(handoff, 'STATUS.md'), 'utf8');
    const m = status.match(/\*\*Active phase:\*\*\s*\*\*(.+?)\.\*\*/);
    return m ? m[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Stale = generated outputs are older (on disk) than any canonical source file.
 *
 * Uses filesystem mtimes — independent of git commit timing. This is correct
 * because:
 *   * Right after running this generator: output mtimes = NOW; canonical mtimes
 *     are <= NOW (they were edited earlier). Outputs are fresh by definition.
 *   * If canonical changes after the last build: canonical mtime > output mtime
 *     → stale, exactly as we want.
 *
 * Note: this runs inside the generator, so at this exact moment outputs are
 * ABOUT to be written. We check the LAST regen by reading existing outputs'
 * mtime BEFORE we overwrite them. If outputs don't exist yet, never stale.
 */
import { statSync, existsSync, readdirSync as fsReaddirSync } from 'node:fs';

/**
 * Stale at generation time means: a canonical file was modified DURING this
 * run (race condition; rare). At generation time we are by definition
 * producing fresh outputs from the current canonical snapshot — so unless
 * something raced under us, the answer is "not stale".
 *
 * For the read-time use case (someone opens the HTML hours later after
 * editing markdown), we cannot detect that from inside the browser. The
 * pre-commit hook is the actual enforcement — it regenerates whenever
 * canonical files are staged.
 */
const generationStartMs = Date.now();

function staleReason() {
  const canonicalDirs = [stateDir, mapsDir, ownerDir, queueDir];
  for (const dir of canonicalDirs) {
    if (!existsSync(dir)) continue;
    for (const f of fsReaddirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const p = resolve(dir, f);
      const m = statSync(p).mtimeMs;
      if (m > generationStartMs) {
        return `Race: ${p.replace(repoRoot + '/', '')} was modified during this generation run. Re-run handoff:build.`;
      }
    }
  }
  for (const f of ['README.md', 'STATUS.md', 'NEXT_SESSION.md']) {
    const p = resolve(handoff, f);
    if (!existsSync(p)) continue;
    const m = statSync(p).mtimeMs;
    if (m > generationStartMs) {
      return `Race: ${f} was modified during this generation run. Re-run handoff:build.`;
    }
  }
  return null;
}
const staleNote = staleReason();
const isStale = Boolean(staleNote);

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
// Control-loop parsers (Layer 4 — owner-input + feature-queue)
// ---------------------------------------------------------------------------

/** Strip fenced code blocks (``` ... ```) — anything inside is template/example
 *  text and must NEVER be parsed as a live data block. Friend's 2026-05-15
 *  evening verification caught the template being parsed as a NEW note.
 */
function stripCodeFences(text) {
  return text.replace(/```[\s\S]+?```/g, '');
}

/** Parse pending-notes.md. Only the live sections matter:
 *    "## Active notes" → parse Status from each note's body
 *    "## Recently-applied notes (last 5)" → notes implicitly APPLIED
 *    "## Deferred notes" → notes implicitly DEFERRED
 *  Anything outside these three sections (e.g. the Template block) is ignored.
 *  Code fences are stripped first as a safety net. */
function parsePendingNotes() {
  const raw = safeRead(resolve(ownerDir, 'pending-notes.md'));
  const text = stripCodeFences(raw);

  const sectionRanges = [
    { heading: 'Active notes', defaultStatus: null },
    { heading: 'Recently-applied notes', defaultStatus: 'APPLIED' },
    { heading: 'Deferred notes', defaultStatus: 'DEFERRED' },
  ];

  const notes = [];
  for (const { heading, defaultStatus } of sectionRanges) {
    const re = new RegExp(`^##\\s+${heading}[^\\n]*\\n([\\s\\S]+?)(?=\\n##\\s|\\n---|\\Z)`, 'm');
    const m = text.match(re);
    if (!m) continue;
    const body = m[1];
    const subs = body.split(/\n###\s+/).slice(1);
    for (const s of subs) {
      const title = s.split('\n')[0].trim();
      if (!title || /^[—\-_]+$/.test(title)) continue;
      const status =
        (s.match(/-\s*\*\*Status:\*\*\s*([A-Z_]+)/) || [, defaultStatus || ''])[1] || defaultStatus;
      if (!status) continue;
      const affects = (s.match(/-\s*\*\*Affects:\*\*\s*(.+)/) || [, ''])[1].trim();
      const note = (s.match(/-\s*\*\*Note:\*\*\s*(.+(?:\n(?!- \*\*)[^\n]*)*)/) || [, ''])[1].trim();
      const next = (s.match(/-\s*\*\*Owner-suggested next action:\*\*\s*(.+)/) || [, ''])[1].trim();
      notes.push({ title, status, affects, note, next });
    }
  }

  const byStatus = { NEW: [], ACKNOWLEDGED: [], APPLIED: [], DEFERRED: [] };
  for (const n of notes) {
    if (byStatus[n.status]) byStatus[n.status].push(n);
  }
  return { notes, byStatus };
}

/** Parse pending-approvals.md.
 *
 *  Now splits AWAITING_APPROVAL items from BLOCKED items per friend's
 *  2026-05-15 evening verification — they're distinct concepts.
 *
 *  Sections looked at:
 *    "## Currently awaiting approval" → awaiting items
 *    "## Currently blocked"           → blocked items
 *  Each section contains `### Slice: \`<slice-id>\`` subsections.
 */
function parsePendingApprovals() {
  const text = stripCodeFences(safeRead(resolve(ownerDir, 'pending-approvals.md')));

  function extractSlicesIn(sectionRe) {
    const m = text.match(sectionRe);
    if (!m) return [];
    const body = m[0];
    const subs = body.split(/\n###\s+Slice:\s*/).slice(1);
    const out = [];
    for (const s of subs) {
      const id = (s.match(/^`([^`]+)`/) || [, ''])[1];
      if (!id) continue;
      const status = (s.match(/-\s*\*\*Status:\*\*\s*`?([A-Z_]+)`?/) || [, ''])[1];
      const branch = (s.match(/-\s*\*\*Branch:\*\*\s*`?([^`\n]+)`?/) || [, ''])[1].trim();
      const wipCommit = (s.match(/-\s*\*\*WIP commit:\*\*\s*`?([a-f0-9]{7,40})/) || [, ''])[1];
      const lastLanded = (s.match(/-\s*\*\*Last landed commit:\*\*\s*`?([a-f0-9]{7,40})/) || [, ''])[1];
      const workflowIds = (s.match(/-\s*\*\*Workflow IDs affected:\*\*\s*(.+)/) || [, ''])[1].trim();
      const blocking = (s.match(/-\s*\*\*What's blocking:\*\*\s*(.+(?:\n(?!- \*\*)[^\n]*)*)/) || [, ''])[1].trim();
      const built = (s.match(/-\s*\*\*What was built:\*\*\s*(.+(?:\n(?!- \*\*)[^\n]*)*)/) || [, ''])[1].trim();
      const notDone = (s.match(/-\s*\*\*(?:What's NOT done|Remaining to finish slice):\*\*\s*(.+(?:\n(?!- \*\*)[^\n]*)*)/) || [, ''])[1].trim();
      const ownerDecision = (s.match(/-\s*\*\*Owner decision:\*\*\s*(.+)/) || [, ''])[1].trim();
      out.push({ id, status, branch, wipCommit, lastLanded, workflowIds, blocking, built, notDone, ownerDecision });
    }
    return out;
  }

  const awaiting = extractSlicesIn(
    /##\s+Currently awaiting approval[\s\S]+?(?=\n##\s|\Z)/,
  );
  const blocked = extractSlicesIn(
    /##\s+Currently blocked[\s\S]+?(?=\n##\s|\Z)/,
  );
  return { awaiting, blocked };
}

/** Parse active-slice.md — the top "## Current" table. */
function parseActiveSlice() {
  const text = safeRead(resolve(ownerDir, 'active-slice.md'));
  const rows = {};
  const tableMatch = text.match(/##\s+Current\s*\n([\s\S]+?)(?=\n##\s|\n---|\Z)/);
  if (!tableMatch) return {};
  for (const line of tableMatch[1].split('\n')) {
    const m = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|\s*(.+?)\s*\|$/);
    if (m) rows[m[1].trim()] = m[2].trim();
  }
  return rows;
}

/** Parse change-history.md last 10 rows. */
function parseChangeHistory() {
  const text = safeRead(resolve(ownerDir, 'change-history.md'));
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|$/);
    if (m && !m[1].toLowerCase().includes('when')) {
      rows.push({ when: m[1], slice: m[2], transition: m[3], commit: m[4], note: m[5] });
    }
    if (rows.length >= 10) break;
  }
  return rows;
}

/** Parse feature-queue/INDEX.md — each `### F-NNN — title` block. */
function parseFeatureQueue() {
  const text = safeRead(resolve(queueDir, 'INDEX.md'));
  const sections = text.split(/\n###\s+/).slice(1);
  const features = [];
  for (const s of sections) {
    const headerLine = s.split('\n')[0].trim();
    const idMatch = headerLine.match(/^(F-\d+)\s+—\s+(.+)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const title = idMatch[2];
    const get = (label) => {
      const re = new RegExp(`-\\s*\\*\\*${label}:\\*\\*\\s*(.+(?:\\n(?!- \\*\\*)[^\\n]*)*)`, 'm');
      const m = s.match(re);
      return m ? m[1].trim() : '';
    };
    const status = (s.match(/-\s*\*\*status:\*\*\s*`?([A-Z_]+)`?/i) || [, ''])[1];
    features.push({
      id,
      title,
      why: get('why'),
      depends_on: get('depends on'),
      personas: get('personas touched'),
      workflows: get('workflows touched'),
      entities: get('entities/routes/tables touched'),
      verification: get('expected verification gate'),
      status,
    });
  }
  return features;
}

const pendingNotes = parsePendingNotes();
const pendingApprovals = parsePendingApprovals();
const activeSliceFields = parseActiveSlice();
const changeHistory = parseChangeHistory();
const featureQueue = parseFeatureQueue();

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------
const json = {
  schema_version: 3,
  metadata: {
    last_updated_at: generatedAt,
    generated_against_head: generatedAgainstHead,
    generated_against_branch: generatedAgainstBranch,
    /**
     * IMPORTANT — drift note (friend verification 2026-05-15 evening).
     *
     * Under the auto-regen pre-commit hook, the generator runs BEFORE the new
     * commit is finalized, so `git rev-parse HEAD` returns the PRIOR commit.
     * The commit hash above is therefore the commit immediately PRECEDING the
     * one that contains this JSON file. Run `git log -1` to get the true
     * containing commit.
     *
     * Manual `pnpm run handoff:build` outside a commit DOES write the true
     * current HEAD (because no new commit is being created).
     */
    commit_truth_note: 'Under auto-regen pre-commit, generated_against_head is the PRIOR commit (the commit containing this JSON is one hash ahead). Use `git log -1` for the absolute newest.',
    last_canonical_commit_at_gen: lastCanonicalCommit,
    staleness_warning: isStale ? staleNote : null,
    active_slice: activeSlice(),
    generated_from: [
      'handoff/execution-state/*.md',
      'handoff/workflow-maps/*.md',
      'handoff/owner-input/INDEX.md',
      'handoff/owner-input/pending-notes.md',
      'handoff/owner-input/pending-approvals.md',
      'handoff/owner-input/active-slice.md',
      'handoff/owner-input/change-history.md',
      'handoff/feature-queue/INDEX.md',
      'handoff/STATUS.md',
      'handoff/NEXT_SESSION.md',
      'handoff/README.md',
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
  control_loop: {
    active_slice: activeSliceFields,
    pending_approvals: pendingApprovals.awaiting,
    blocked_items: pendingApprovals.blocked,
    pending_notes: {
      counts: {
        NEW: pendingNotes.byStatus.NEW.length,
        ACKNOWLEDGED: pendingNotes.byStatus.ACKNOWLEDGED.length,
        APPLIED: pendingNotes.byStatus.APPLIED.length,
        DEFERRED: pendingNotes.byStatus.DEFERRED.length,
      },
      notes: pendingNotes.notes,
    },
    feature_queue: featureQueue,
    change_history: changeHistory,
  },
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

function statusBadge(value) {
  const colors = {
    PLANNED: '#999',
    WIP: '#1a73e8',
    AWAITING_APPROVAL: '#f5b400',
    APPROVED: '#1e8e3e',
    BLOCKED: '#8e24aa',
    DONE: '#0b6624',
    QUEUED: '#666',
    READY: '#1e8e3e',
    NEW: '#e53935',
    ACKNOWLEDGED: '#1a73e8',
    APPLIED: '#1e8e3e',
    DEFERRED: '#999',
  };
  const fg = '#fff';
  const bg = colors[value] || '#bdbdbd';
  return `<span class="badge" style="background:${bg};color:${fg};">${escape(value || '—')}</span>`;
}

function activeSliceSection() {
  if (!activeSliceFields || Object.keys(activeSliceFields).length === 0) return '';
  const rows = Object.entries(activeSliceFields).map(([k, v]) => {
    const isStatus = k.toLowerCase().includes('status');
    const cell = isStatus ? statusBadge(v.replace(/`/g, '').trim()) : renderInline(v);
    return `<tr><th>${escape(k)}</th><td>${cell}</td></tr>`;
  }).join('');
  return `
  <section id="active-slice" class="active-slice-callout">
    <h2>🟦 Current slice focus</h2>
    <p class="small">Mirrors <a href="../owner-input/active-slice.md">handoff/owner-input/active-slice.md</a> — the single source of truth for what is in flight right now.</p>
    <table class="kv-table">${rows}</table>
  </section>`;
}

function pendingNotesSection() {
  const { byStatus, notes } = pendingNotes;
  const newCount = byStatus.NEW.length;
  const banner = newCount > 0
    ? `<div class="note-banner urgent">⚠ ${newCount} NEW owner note${newCount === 1 ? '' : 's'} — must be acknowledged before any slice starts (rule 16 + 21).</div>`
    : `<div class="note-banner ok">No NEW owner notes. Confirm at session start: "0 NEW notes" (rule 21).</div>`;
  const renderNotes = (group, label) => group.length === 0 ? '' : `
    <h3>${label} (${group.length})</h3>
    ${group.map((n) => `
      <div class="note">
        <div class="note-head">${statusBadge(n.status)} <strong>${escape(n.title)}</strong></div>
        ${n.affects ? `<p class="small"><strong>Affects:</strong> ${escape(n.affects)}</p>` : ''}
        ${n.note ? `<p>${renderInline(n.note)}</p>` : ''}
        ${n.next ? `<p class="small"><strong>Owner-suggested next:</strong> ${renderInline(n.next)}</p>` : ''}
      </div>`).join('')}`;
  return `
  <section id="owner-notes" class="control-section">
    <h2>📝 Owner notes</h2>
    ${banner}
    ${renderNotes(byStatus.NEW, 'NEW — needs acknowledgment')}
    ${renderNotes(byStatus.ACKNOWLEDGED, 'ACKNOWLEDGED')}
    ${renderNotes(byStatus.APPLIED, 'APPLIED')}
    ${renderNotes(byStatus.DEFERRED, 'DEFERRED')}
    <p class="source-link small">
      Source of truth: <a href="../owner-input/pending-notes.md">handoff/owner-input/pending-notes.md</a>.
      To add a note: append to that file using the template at the top.
    </p>
  </section>`;
}

function renderApprovalCard(a, kind) {
  return `
      <div class="approval">
        <div class="approval-head">${statusBadge(a.status)} <strong><code>${escape(a.id)}</code></strong></div>
        ${a.branch ? `<p class="small"><strong>Branch:</strong> <code>${escape(a.branch)}</code></p>` : ''}
        ${a.lastLanded ? `<p class="small"><strong>Last landed commit:</strong> <code>${escape(a.lastLanded)}</code></p>` : ''}
        ${a.wipCommit ? `<p class="small"><strong>WIP commit:</strong> <code>${escape(a.wipCommit)}</code></p>` : ''}
        ${a.workflowIds ? `<p class="small"><strong>Workflows affected:</strong> ${escape(a.workflowIds)}</p>` : ''}
        ${a.blocking ? `<p><strong>What's blocking:</strong> ${renderInline(a.blocking)}</p>` : ''}
        ${a.built ? `<p><strong>Built:</strong> ${renderInline(a.built)}</p>` : ''}
        ${a.notDone ? `<p><strong>${kind === 'blocked' ? 'Remaining' : 'Not done'}:</strong> ${renderInline(a.notDone)}</p>` : ''}
        ${a.ownerDecision ? `<p class="small"><strong>Owner decision:</strong> <em>${renderInline(a.ownerDecision)}</em></p>` : ''}
      </div>`;
}

function approvalsSection() {
  const { awaiting, blocked } = pendingApprovals;
  const awaitingHtml = awaiting.length === 0
    ? '<p>No items awaiting approval.</p>'
    : awaiting.map((a) => renderApprovalCard(a, 'awaiting')).join('');
  return `
  <section id="approvals" class="control-section">
    <h2>✅ Approval gate</h2>
    <p class="small">Owner must write <code>APPROVED</code> / <code>CHANGES_REQUESTED</code> / <code>HOLD</code> in <a href="../owner-input/pending-approvals.md">handoff/owner-input/pending-approvals.md</a> for each item below. Rule 17: no next slice starts while any item here is <code>AWAITING_APPROVAL</code>.</p>
    ${awaitingHtml}
  </section>`;
}

function blockedSection() {
  const { blocked } = pendingApprovals;
  if (blocked.length === 0) return '';
  return `
  <section id="blocked" class="control-section">
    <h2>⛔ Blocked items</h2>
    <p class="small">Slices blocked by external dependency — <strong>not</strong> awaiting your decision. These resume automatically when their named blocker clears. Source: <a href="../owner-input/pending-approvals.md">handoff/owner-input/pending-approvals.md</a>.</p>
    ${blocked.map((a) => renderApprovalCard(a, 'blocked')).join('')}
  </section>`;
}

function featureQueueSection() {
  if (featureQueue.length === 0) return '';
  return `
  <section id="feature-queue" class="control-section">
    <h2>📋 Feature queue (upcoming slices)</h2>
    <p class="small">In priority order. Top = next. Click any item to expand its full scope. Source: <a href="../feature-queue/INDEX.md">handoff/feature-queue/INDEX.md</a>.</p>
    ${featureQueue.map((f) => `
      <details class="feature">
        <summary>
          <code>${escape(f.id)}</code>
          ${statusBadge(f.status)}
          <strong>${escape(f.title)}</strong>
        </summary>
        <div class="feature-body">
          ${f.why ? `<p><strong>Why:</strong> ${renderInline(f.why)}</p>` : ''}
          ${f.depends_on ? `<p><strong>Depends on:</strong> ${renderInline(f.depends_on)}</p>` : ''}
          ${f.personas ? `<p><strong>Personas:</strong> ${escape(f.personas)}</p>` : ''}
          ${f.workflows ? `<p><strong>Workflows:</strong> ${escape(f.workflows)}</p>` : ''}
          ${f.entities ? `<p><strong>Entities / routes / tables:</strong> ${renderInline(f.entities)}</p>` : ''}
          ${f.verification ? `<p><strong>Verification gate:</strong> ${renderInline(f.verification)}</p>` : ''}
        </div>
      </details>`).join('')}
  </section>`;
}

function changeHistorySection() {
  if (changeHistory.length === 0) return '';
  const rows = changeHistory.map((r) => `
    <tr>
      <td class="small">${escape(r.when)}</td>
      <td><code>${escape(r.slice)}</code></td>
      <td><code>${escape(r.transition)}</code></td>
      <td><code>${escape(r.commit)}</code></td>
      <td class="small">${renderInline(r.note)}</td>
    </tr>`).join('');
  return `
  <section id="change-history" class="control-section">
    <h2>📜 Change history (last ${changeHistory.length} transitions)</h2>
    <table class="workflow-table">
      <thead><tr><th>When</th><th>Slice</th><th>Transition</th><th>Commit</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="source-link small">Source: <a href="../owner-input/change-history.md">handoff/owner-input/change-history.md</a>.</p>
  </section>`;
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
    .active-slice-callout { background: rgba(26,115,232,0.10); border: 2px solid #1a73e8;
                             border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .active-slice-callout h2 { color: #1a73e8; margin-top: 0; }
    .control-section { background: var(--card); border: 1px solid var(--border); border-radius: 8px;
                       padding: 20px; margin-bottom: 24px; }
    .nav-control { background: var(--bg); border: 1px solid var(--border); }
    .nav-sep { color: var(--muted); padding: 4px 4px; }
    .note-banner { padding: 10px 14px; border-radius: 4px; font-size: 13px; margin: 8px 0; }
    .note-banner.urgent { background: rgba(229,57,53,0.10); border-left: 4px solid #e53935; color: #c62828; font-weight: 600; }
    .note-banner.ok { background: rgba(30,142,62,0.08); border-left: 4px solid #1e8e3e; }
    .note { background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
            padding: 12px; margin: 8px 0; }
    .note-head { font-size: 14px; margin-bottom: 6px; }
    .approval { background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
                padding: 12px; margin: 8px 0; }
    .approval-head { font-size: 14px; margin-bottom: 6px; }
    details.feature { background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
                       padding: 10px 12px; margin: 6px 0; }
    details.feature summary { cursor: pointer; font-size: 14px; padding: 4px 0; }
    details.feature[open] summary { margin-bottom: 8px; }
    .feature-body p { font-size: 13px; margin: 4px 0; }
    .kv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .kv-table th { text-align: left; padding: 6px 12px; width: 200px;
                   border-bottom: 1px solid var(--border); color: var(--muted); font-weight: 600; }
    .kv-table td { padding: 6px 12px; border-bottom: 1px solid var(--border); }
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
      <span title="Under auto-regen pre-commit hook, this is the commit immediately PRECEDING the commit containing this HTML. Run 'git log -1' for the absolute newest.">Generated against HEAD <code>${generatedAgainstHead.slice(0, 8)}</code></span>
      <span>Branch <code>${generatedAgainstBranch}</code></span>
      <span>Active slice: <strong>${escape(activeSlice())}</strong></span>
      ${isStale ? `<span class="stale">⚠ STALE — re-run <code>pnpm run handoff:build</code></span>` : ''}
    </div>
  </header>
  <nav>
    <a href="#active-slice" class="nav-control">🟦 Current slice</a>
    <a href="#owner-notes" class="nav-control">📝 Notes</a>
    <a href="#approvals" class="nav-control">✅ Approvals</a>
    <a href="#blocked" class="nav-control">⛔ Blocked</a>
    <a href="#feature-queue" class="nav-control">📋 Queue</a>
    <a href="#change-history" class="nav-control">📜 History</a>
    <span class="nav-sep">·</span>
    <a href="#summary">Summary</a>
    ${personaFiles.map((p) => `<a href="#persona-${p.key}">${escape(p.name)}</a>`).join('')}
    <a href="#combined">Cross-persona</a>
    <a href="#data-model">Data model</a>
  </nav>
  <main>
    ${activeSliceSection()}
    ${pendingNotesSection()}
    ${approvalsSection()}
    ${blockedSection()}
    ${featureQueueSection()}
    ${changeHistorySection()}

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
      <p class="small">Regenerated from canonical markdown by <code>handoff/scripts/build-handoff-artifacts.mjs</code>. Per execution-state/INDEX.md rule 7: any time canonical sources change, re-run <code>pnpm run handoff:build</code>. Per rule 11: never hand-edit this HTML or the JSON — they are derived artifacts only.</p>
      <p class="small">Auto-regen: <code>.husky/pre-commit</code> rebuilds + stages outputs whenever canonical files are staged. Manual regen: <code>pnpm run handoff:build</code>.</p>
      <p class="small">Rendering: this HTML runs Mermaid via the jsdelivr CDN. <strong>Where it reliably renders:</strong> any local browser, any static-file server (e.g. <code>python3 -m http.server</code>), GitHub Pages, Vercel/Netlify static deploy. <strong>Where rendering is NOT assumed:</strong> raw GitHub web view of the HTML file (GitHub blob view doesn't reliably execute the module-script that loads Mermaid). The Mermaid <em>markdown</em> files (<code>handoff/workflow-maps/*.md</code>) DO render natively in GitHub web — that's how you'd browse the diagrams from a phone via the GitHub mobile app or web.</p>
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
console.log(`generated against HEAD ${generatedAgainstHead.slice(0, 8)} on ${generatedAgainstBranch} (under auto-regen, true containing commit is one ahead)`);
console.log(`active slice: ${activeSlice()}`);
if (isStale) console.log('⚠ STALE — canonical sources newer than current HEAD');

/**
 * tools/connectedness/src/extractors/manifests.ts
 *
 * Idx-2 extractor — connectedness/features/*.yml → feature ownership.
 *
 * Parses each manifest, emits one feature node + edges for every
 * ownership/route/spec/test/affects/external_reference declaration.
 *
 * Validates the live/planned split for routes / state_machines / tests
 * and warns when fields drift from the schema in README.md.
 *
 * @derives(ADR-0002) — graph/connectedness substrate; consumer of NodeRecord/EdgeRecord types
 * @derives(panel-2026-05-13) — Connectedness MVP scope (Idx-1..Idx-4)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYAML } from 'yaml';
import type { EdgeRecord, NodeRecord } from '@axhy/knowledge-graph';

export type ManifestRouteSplit = { live: string[]; planned: string[] };

export type Manifest = {
  feature: string;
  status: 'active' | 'active-but-contract-incomplete' | 'deprecated';
  description: string;
  owns: {
    tables: string[];
    state_machines: ManifestRouteSplit;
  };
  provisional_owns?: {
    tables: Array<{
      name: string;
      reason: string;
      rightful_owner: string;
      migrate_when: string;
    }>;
  };
  routes: ManifestRouteSplit;
  ui: {
    surfaces: string[];
    prototypes: string[];
  };
  packages: string[];
  specs: string[];
  tests: ManifestRouteSplit;
  affects: string[];
  external_references: Array<{
    name: string;
    why: string;
    iteration: number;
  }>;
  sourcePath: string;
};

export type ManifestExtractorResult = {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
  manifests: Manifest[];
  warnings: string[];
};

export function extractManifests(repoRoot: string): ManifestExtractorResult {
  const nodes: NodeRecord[] = [];
  const edges: EdgeRecord[] = [];
  const manifests: Manifest[] = [];
  const warnings: string[] = [];

  const featuresDir = join(repoRoot, 'connectedness/features');
  let entries: string[];
  try {
    entries = readdirSync(featuresDir);
  } catch {
    warnings.push(`Features dir not readable: ${featuresDir}`);
    return { nodes, edges, manifests, warnings };
  }

  for (const entry of entries) {
    if (!entry.endsWith('.yml')) continue;
    const fullPath = join(featuresDir, entry);
    if (!statSync(fullPath).isFile()) continue;

    const relPath = `connectedness/features/${entry}`;
    let raw: string;
    try {
      raw = readFileSync(fullPath, 'utf8');
    } catch {
      warnings.push(`Manifest unreadable: ${relPath}`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseYAML(raw);
    } catch (err) {
      warnings.push(`YAML parse failed for ${relPath}: ${(err as Error).message}`);
      continue;
    }

    const m = parsed as Record<string, unknown>;
    const featureName = typeof m['feature'] === 'string' ? m['feature'] : null;
    if (!featureName) {
      warnings.push(`Manifest ${relPath} missing required 'feature' field`);
      continue;
    }

    const filenameStem = entry.replace(/\.yml$/, '');
    if (featureName !== filenameStem) {
      warnings.push(
        `Manifest ${relPath}: feature name '${featureName}' does not match filename stem '${filenameStem}'`,
      );
    }

    const manifest = normalizeManifest(m, relPath, warnings);
    manifests.push(manifest);

    nodes.push({
      kind: 'feature',
      name: manifest.feature,
      sourcePath: relPath,
      metadata: {
        status: manifest.status,
        description: manifest.description,
      },
    });

    for (const table of manifest.owns.tables) {
      edges.push({
        kind: 'implements',
        srcKey: { kind: 'feature', name: manifest.feature, sourcePath: relPath },
        dstKey: { kind: 'entity', name: table, sourcePath: null },
        metadata: { ownershipKind: 'permanent' },
      });
    }

    if (manifest.provisional_owns) {
      for (const provTable of manifest.provisional_owns.tables) {
        edges.push({
          kind: 'implements',
          srcKey: { kind: 'feature', name: manifest.feature, sourcePath: relPath },
          dstKey: { kind: 'entity', name: provTable.name, sourcePath: null },
          metadata: {
            ownershipKind: 'provisional',
            rightful_owner: provTable.rightful_owner,
            migrate_when: provTable.migrate_when,
          },
        });
      }
    }

    for (const sm of manifest.owns.state_machines.live) {
      edges.push({
        kind: 'implements',
        srcKey: { kind: 'feature', name: manifest.feature, sourcePath: relPath },
        dstKey: { kind: 'state', name: sm, sourcePath: sm },
        metadata: { ownershipKind: 'permanent', lifecycle: 'live' },
      });
    }
    for (const sm of manifest.owns.state_machines.planned) {
      edges.push({
        kind: 'implements',
        srcKey: { kind: 'feature', name: manifest.feature, sourcePath: relPath },
        dstKey: { kind: 'state', name: sm, sourcePath: sm },
        metadata: { ownershipKind: 'permanent', lifecycle: 'planned' },
      });
    }

    for (const route of manifest.routes.live) {
      edges.push({
        kind: 'covers',
        srcKey: { kind: 'feature', name: manifest.feature, sourcePath: relPath },
        dstKey: { kind: 'api_endpoint', name: route, sourcePath: null },
        metadata: { lifecycle: 'live' },
      });
    }
    for (const route of manifest.routes.planned) {
      edges.push({
        kind: 'covers',
        srcKey: { kind: 'feature', name: manifest.feature, sourcePath: relPath },
        dstKey: { kind: 'api_endpoint', name: route, sourcePath: null },
        metadata: { lifecycle: 'planned' },
      });
    }

    for (const target of manifest.affects) {
      edges.push({
        kind: 'triggers',
        srcKey: { kind: 'feature', name: manifest.feature, sourcePath: relPath },
        dstKey: { kind: 'feature', name: target, sourcePath: null },
        metadata: { cascadeKind: 'mapped' },
      });
    }

    for (const ext of manifest.external_references) {
      edges.push({
        kind: 'triggers',
        srcKey: { kind: 'feature', name: manifest.feature, sourcePath: relPath },
        dstKey: { kind: 'feature', name: ext.name, sourcePath: null },
        metadata: {
          cascadeKind: 'external',
          why: ext.why,
          iteration: ext.iteration,
        },
      });
    }
  }

  validateAffectsResolve(manifests, warnings);

  return { nodes, edges, manifests, warnings };
}

function normalizeManifest(
  raw: Record<string, unknown>,
  sourcePath: string,
  warnings: string[],
): Manifest {
  const featureName = (raw['feature'] as string) ?? 'unknown';
  const owns = (raw['owns'] as Record<string, unknown>) ?? {};
  const ownsTables = asStringArray(owns['tables']);
  const ownsStateMachines = asSplit(
    owns['state_machines'],
    `${sourcePath}.owns.state_machines`,
    warnings,
  );
  const routes = asSplit(raw['routes'], `${sourcePath}.routes`, warnings);
  const tests = asSplit(raw['tests'], `${sourcePath}.tests`, warnings);
  const ui = (raw['ui'] as Record<string, unknown>) ?? {};
  const externalRaw = (raw['external_references'] as unknown[]) ?? [];

  return {
    feature: featureName,
    status: (raw['status'] as Manifest['status']) ?? 'active',
    description: (raw['description'] as string) ?? '',
    owns: {
      tables: ownsTables,
      state_machines: ownsStateMachines,
    },
    provisional_owns: parseProvisionalOwns(raw['provisional_owns']),
    routes,
    ui: {
      surfaces: asStringArray(ui['surfaces']),
      prototypes: asStringArray(ui['prototypes']),
    },
    packages: asStringArray(raw['packages']),
    specs: asStringArray(raw['specs']),
    tests,
    affects: asStringArray(raw['affects']),
    external_references: externalRaw.map((r) => {
      const er = r as Record<string, unknown>;
      return {
        name: (er['name'] as string) ?? '',
        why: (er['why'] as string) ?? '',
        iteration: (er['iteration'] as number) ?? 0,
      };
    }),
    sourcePath,
  };
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asSplit(v: unknown, fieldRef: string, warnings: string[]): ManifestRouteSplit {
  if (v === undefined || v === null) return { live: [], planned: [] };
  if (Array.isArray(v)) {
    // Tolerate flat arrays (legacy schema) — surface as warning.
    warnings.push(
      `${fieldRef}: expected live/planned split, got flat array; treating all entries as 'live'`,
    );
    return { live: v.filter((x): x is string => typeof x === 'string'), planned: [] };
  }
  if (typeof v !== 'object') return { live: [], planned: [] };
  const obj = v as Record<string, unknown>;
  return {
    live: asStringArray(obj['live']),
    planned: asStringArray(obj['planned']),
  };
}

function parseProvisionalOwns(v: unknown): Manifest['provisional_owns'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const obj = v as Record<string, unknown>;
  const tables = obj['tables'];
  if (!Array.isArray(tables)) return undefined;
  return {
    tables: tables
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
      .map((t) => ({
        name: (t['name'] as string) ?? '',
        reason: (t['reason'] as string) ?? '',
        rightful_owner: (t['rightful_owner'] as string) ?? '',
        migrate_when: (t['migrate_when'] as string) ?? '',
      })),
  };
}

function validateAffectsResolve(manifests: Manifest[], warnings: string[]): void {
  const featureNames = new Set(manifests.map((m) => m.feature));
  for (const m of manifests) {
    for (const target of m.affects) {
      if (!featureNames.has(target)) {
        warnings.push(
          `${m.sourcePath}: affects '${target}' does not resolve to a mapped MVP manifest`,
        );
      }
    }
  }
}

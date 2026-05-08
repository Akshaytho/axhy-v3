/**
 * SearchBar — fuzzy search across all graph nodes.
 * Dropdown shows kind + name + source path. Click navigates to that node.
 *
 * @derives(ADR-0014)
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import styles from '../_styles.module.css';

import type { GraphNode } from './types';

type SearchBarProps = {
  nodes: GraphNode[];
  onSelect: (node: GraphNode) => void;
};

const KIND_LABELS: Record<string, string> = {
  ui_screen: 'screen',
  api_endpoint: 'route',
  entity: 'table',
  state: 'machine',
  adr: 'adr',
  field: 'field',
  transition: 'transition',
  ui_component: 'component',
  master_plan_section: 'plan',
  panel_debate: 'debate',
  doc: 'doc',
};

function scoreMatch(node: GraphNode, query: string): number {
  const q = query.toLowerCase();
  const name = node.name.toLowerCase();
  const path = (node.sourcePath ?? '').toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (path.includes(q)) return 40;
  return 0;
}

/** @derives(ADR-0014) */
export function SearchBar({ nodes, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return nodes
      .map((n) => ({ node: n, score: scoreMatch(n, query.trim()) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((r) => r.node);
  }, [nodes, query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(node: GraphNode) {
    onSelect(node);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className={styles.searchWrap} ref={wrapRef}>
      <span className={styles.searchIcon} aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search nodes…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query && setOpen(true)}
        aria-label="Search graph nodes"
        autoComplete="off"
      />
      {open && query.trim() && (
        <div className={styles.searchDropdown} role="listbox">
          {results.length === 0 ? (
            <div className={styles.searchResultEmpty}>No nodes match &quot;{query}&quot;</div>
          ) : (
            results.map((node) => (
              <div
                key={node.id}
                className={styles.searchResultItem}
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(node)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSelect(node);
                }}
                tabIndex={0}
              >
                <span className={styles.searchResultKindBadge}>
                  {KIND_LABELS[node.kind] ?? node.kind}
                </span>
                <div>
                  <div className={styles.searchResultName}>{node.name}</div>
                  {node.sourcePath && (
                    <div className={styles.searchResultPath}>{node.sourcePath}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

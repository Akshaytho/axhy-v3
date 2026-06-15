'use client';

import type { CSSProperties } from 'react';

import { ICONS } from './icons';

/**
 * Verbatim port of v6 ui.jsx Icon — single-path Lucide renderer.
 * @derives(master-plan §G)
 */
export function Icon({
  name,
  size = 18,
  className = '',
  strokeWidth = 1.75,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

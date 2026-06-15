'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Icon } from './Icon';

/**
 * Re-fetches the current server component tree (live data) with a spin state.
 * @derives(master-plan §G)
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="icon-btn"
      title="Refresh"
      type="button"
      onClick={() => start(() => router.refresh())}
    >
      <Icon
        name="refresh"
        size={18}
        style={pending ? { animation: 'spin 0.7s linear infinite' } : undefined}
      />
    </button>
  );
}

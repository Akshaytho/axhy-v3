/**
 * HR portal error boundary — catches errors thrown by /hr/* server
 * components and surfaces a fallback. If the error looks auth-related
 * (401 in the message), redirects to /login.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 13
 *
 * @derives(master-plan §G)
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Error boundary component for /hr route group.
 *
 * @derives(master-plan §G)
 */
export default function HrError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    if (error.message.includes('401') || error.message.includes('NEXT_REDIRECT')) {
      router.push('/login');
    }
  }, [error, router]);
  return (
    <section style={{ padding: 32 }}>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}

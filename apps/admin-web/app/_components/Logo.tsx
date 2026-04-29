/**
 * Logo "A" with gold dot — Axhy brand mark. Pixel-matches Claude Design.
 *
 * @derives(ADR-0005)
 */

import Link from 'next/link';

export function Logo({ withWordmark = false }: { withWordmark?: boolean }) {
  return (
    <Link href="/" className="logo" aria-label="Axhy home">
      A<span className="dot" aria-hidden="true"></span>
      {withWordmark ? <span style={{ marginLeft: 4 }}>Axhy</span> : null}
    </Link>
  );
}

import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** @derives(ADR-0002) */
export default function Page({ id }: { id: string }) {
  const router = useRouter();
  return (
    <>
      <Link href="/pricing">Pricing</Link>
      <button onClick={() => router.push('/login')}>Login</button>
      <button onClick={() => router.push(`/visit/${id}`)}>View visit</button>
      <button onClick={() => router.push(makeUrl())}>Unresolvable</button>
    </>
  );
}

/**
 * Index route — auth gate. Reads stored JWT and redirects to either the
 * supervisor stack (authed) or the phone-OTP stack (unauthed).
 *
 * Lives at `/` so expo-router has an entry to render before any
 * navigation happens. Returns a `<Redirect>` element rather than
 * calling `router.replace()` imperatively, because v6 requires the
 * navigator to be mounted before imperative navigation resolves.
 *
 * F-006a: when tokens are present, `onColdStartReady(tokens)` runs the
 * ONE explicit identity contract — defensive role check + conditional
 * OneSignal re-link — and returns the route to land on. Idempotent in
 * the SDK; covers reinstall, OS-level subscription drift, SDK version
 * bumps.
 *
 * @derives(ADR-0007)
 * @derives(F-006a scope round-2 v6 Pick 7)
 */

import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';

import { getTokens } from '../lib/auth-store';
import { onColdStartReady, type ColdStartRoute } from '../lib/identity-lifecycle';

export default function Index() {
  const [route, setRoute] = useState<ColdStartRoute | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tokens = await getTokens();
        if (!tokens) {
          if (!cancelled) setRoute('/(auth)/phone');
          return;
        }
        const { route: nextRoute } = await onColdStartReady(tokens);
        if (!cancelled) setRoute(nextRoute);
      } catch {
        if (!cancelled) setRoute('/(auth)/phone');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (route === null) return null;
  return <Redirect href={route} />;
}

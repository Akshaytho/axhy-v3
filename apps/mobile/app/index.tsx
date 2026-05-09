/**
 * Index route — auth gate. Reads stored JWT and redirects to either the
 * supervisor stack (authed) or the phone-OTP stack (unauthed).
 *
 * Lives at `/` so expo-router has an entry to render before any
 * navigation happens. Returns a `<Redirect>` element rather than
 * calling `router.replace()` imperatively, because v6 requires the
 * navigator to be mounted before imperative navigation resolves.
 *
 * @derives(ADR-0007)
 */

import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';

import { getTokens } from '../lib/auth-store';

export default function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getTokens()
      .then((tokens) => setAuthed(Boolean(tokens)))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  return <Redirect href={authed ? '/(supervisor)/profile' : '/(auth)/phone'} />;
}

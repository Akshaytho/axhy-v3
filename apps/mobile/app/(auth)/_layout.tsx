/**
 * Auth route group layout — unauthenticated screens.
 * @derives(ADR-0007)
 */

import { Stack } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.color.surface.paper },
      }}
    />
  );
}

/**
 * Supervisor profile screen — shows user identity, company, role, sign-out.
 * @derives(ADR-0007)
 * @derives(ADR-0021)
 */

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '@axhy/ui-tokens';
import type { MeOutput } from '@axhy/shared-schema';

import { apiFetch } from '../../lib/api';
import { clearTokens } from '../../lib/auth-store';

function fetchMe(): Promise<MeOutput> {
  return apiFetch<MeOutput>('/me');
}

function StatRow({
  label,
  value,
  divider = true,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <View style={[row.container, !divider && row.noBorder]}>
      <Text style={row.label}>{label}</Text>
      <Text style={row.value}>{value}</Text>
    </View>
  );
}

const row = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space[4],
    paddingVertical: 14,
    minHeight: tokens.tap.minMobile,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    fontWeight: String(tokens.weight.medium) as '500',
  },
  value: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
});

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <View style={sec.wrap}>
      <Text style={sec.eyebrow}>{title}</Text>
      <View style={sec.card}>{children}</View>
    </View>
  );
}

const sec = StyleSheet.create({
  wrap: {
    marginBottom: tokens.space[5],
  },
  eyebrow: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.caption.tracking,
    textTransform: 'uppercase',
    paddingHorizontal: tokens.space[1],
    marginBottom: tokens.space[2],
  },
  card: {
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    overflow: 'hidden',
  },
});

export default function ProfileScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  async function handleSignOut() {
    await clearTokens();
    router.replace('/(auth)/phone');
  }

  if (isLoading) {
    return (
      <SafeAreaView style={s.center} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={tokens.color.brand.accent} />
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={s.center} edges={['top', 'left', 'right']}>
        <TouchableOpacity onPress={() => refetch()}>
          <Text style={s.errorText}>Couldn't load profile. Tap to retry.</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const displayName = data.user.name ?? data.user.phone;
  const firstName = displayName.split(' ')[0] ?? displayName;
  const initial = firstName[0]?.toUpperCase() ?? '?';

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          <View style={s.headerText}>
            <Text style={s.greeting}>Namaste, {firstName}.</Text>
            <Text style={s.roleChip}>
              {data.activeRole} · {data.activeCompany.name}
            </Text>
          </View>
        </View>

        <Section title="PROFILE">
          <StatRow label="Name" value={displayName} />
          <StatRow label="Company" value={data.activeCompany.name} />
          <StatRow label="Role" value={data.activeRole} divider={false} />
        </Section>

        <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={s.build}>AXHY · v3 · BUILD 2026.05.08</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  content: {
    padding: tokens.space[4],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[6],
  },
  center: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[4],
  },
  errorText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.brand.accent,
    textAlign: 'center',
    fontWeight: String(tokens.weight.medium) as '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: tokens.space[1],
    marginBottom: tokens.space[6],
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: tokens.color.brand.accentSoft,
    borderWidth: 1,
    borderColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accentInk,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    letterSpacing: tokens.type.heading.tracking,
  },
  roleChip: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    marginTop: tokens.space[1],
  },
  signOut: {
    marginTop: tokens.space[3],
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.semantic.bad,
    paddingVertical: tokens.space[4],
    alignItems: 'center',
    minHeight: tokens.tap.minMobile,
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.semantic.bad,
  },
  build: {
    marginTop: tokens.space[6],
    textAlign: 'center',
    fontSize: tokens.type.monoSm.size,
    color: tokens.color.ink.placeholder,
    fontWeight: String(tokens.weight.medium) as '500',
    letterSpacing: 0.04,
  },
});

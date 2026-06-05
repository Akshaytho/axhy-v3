/**
 * Supervisor profile screen — shows user identity, company, role, sign-out,
 * language picker, and notification preferences.
 *
 * Switch-company section removed: single-tenant model lock 2026-05-18.
 * NO self-service resign/terminate button here: per the locked rule
 * (no-self-service-resign-or-terminate, 2026-05-18) termination always
 * originates from HR/admin, never the supervisor app. Sign out is the only
 * bottom action.
 *
 * F-006a: sign-out routes through `onAppLogout()` (ONE explicit identity
 * contract) which awaits `OneSignal.logout()` BEFORE `clearTokens()` to
 * prevent phantom-subscription leak on User A → User B switch.
 *
 * @derives(ADR-0003) @derives(ADR-0007) @derives(ADR-0021)
 * @derives(F-006a scope round-2 v6 Pick 4)
 * @derives(master-plan §G) — supervisor surface
 * @derives(no-self-service-resign-or-terminate — locked 2026-05-18: HR-initiated only)
 */

import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { MeOutput, NotificationPrefs } from '@axhy/shared-schema';
import { DEFAULT_NOTIFICATION_PREFS } from '@axhy/shared-schema';
import * as SecureStore from 'expo-secure-store';

import { apiFetch } from '../../lib/api';
import { onAppLogout } from '../../lib/identity-lifecycle';
import { useDrawer } from '../../components/Drawer';
import { useLocaleStrings, setLocale } from '../../lib/i18n/use-locale';

const isWeb = Platform.OS === 'web';

function prefGet(key: string, defaultVal: string): string {
  if (isWeb && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key) ?? defaultVal;
  }
  try {
    return SecureStore.getItem(key) ?? defaultVal;
  } catch {
    return defaultVal;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCALE_KEY = 'axhy_user_locale';
// Notification prefs now persist server-side (Membership.notificationPrefs via
// PATCH /me/notification-prefs) — no device-local SecureStore keys.

type LocaleCode = 'en' | 'hi' | 'te';

const LOCALE_OPTIONS: { code: LocaleCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
];

function localeLabel(code: string): string {
  return LOCALE_OPTIONS.find((o) => o.code === code)?.label ?? 'English';
}

function sanitizeDisplayName(name: string): string {
  return name.replace(/\s*\(real-phone\)\s*$/i, '').trim();
}

// ─── fetchMe ──────────────────────────────────────────────────────────────────

function fetchMe(): Promise<MeOutput> {
  return apiFetch<MeOutput>('/me');
}

// ─── StatRow ──────────────────────────────────────────────────────────────────

/**
 * Generic list row: left label, right value or control.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function StatRow({
  label,
  value,
  divider = true,
  onPress,
  right,
}: {
  label: string;
  value?: string;
  divider?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const inner = (
    <View style={[row.container, !divider && row.noBorder]}>
      <Text style={row.label}>{label}</Text>
      {right != null ? right : <Text style={row.value}>{value ?? ''}</Text>}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
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
    flex: 1,
  },
  value: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  chevron: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    fontWeight: String(tokens.weight.medium) as '500',
  },
});

// ─── Section ──────────────────────────────────────────────────────────────────

/**
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
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

// ─── LanguagePickerSheet ──────────────────────────────────────────────────────

/**
 * Bottom-sheet modal for selecting app language.
 * Persists selection to localStorage (key: axhy_user_locale) via `setLocale`.
 * Strings are locale-aware: the cancel label reflects the currently active locale.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function LanguagePickerSheet({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: LocaleCode;
  onSelect: (code: LocaleCode) => void;
  onClose: () => void;
}) {
  const strings = useLocaleStrings();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modal.backdrop} onPress={onClose}>
        <Pressable style={modal.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={modal.handle} />
          <Text style={modal.title}>Select language</Text>

          {LOCALE_OPTIONS.map((opt, i) => {
            const isLast = i === LOCALE_OPTIONS.length - 1;
            const isActive = opt.code === current;
            return (
              <Pressable
                key={opt.code}
                onPress={() => {
                  onSelect(opt.code);
                  onClose();
                }}
                style={[modal.optionRow, isLast && modal.optionRowLast]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[modal.optionLabel, isActive && modal.optionLabelActive]}>
                  {opt.label}
                </Text>
                {isActive ? <Text style={modal.checkmark}>✓</Text> : null}
              </Pressable>
            );
          })}

          <Pressable style={modal.cancelBtn} onPress={onClose}>
            <Text style={modal.cancelText}>{strings.common.cancel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Shared modal styles ──────────────────────────────────────────────────────

const modal = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.color.surface.card,
    borderTopLeftRadius: tokens.radius.r4,
    borderTopRightRadius: tokens.radius.r4,
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[7],
  },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.surface.paper3,
    alignSelf: 'center',
    marginBottom: tokens.space[3],
  },
  title: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
  },
  subtitle: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[4],
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: tokens.space[2],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    minHeight: tokens.tap.minMobile,
  },
  optionRowLast: {
    borderBottomWidth: 0,
    marginBottom: tokens.space[3],
  },
  optionLabel: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    fontWeight: String(tokens.weight.medium) as '500',
  },
  optionLabelActive: {
    color: tokens.color.brand.accentInk,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  checkmark: {
    fontSize: tokens.type.body.size,
    color: tokens.color.brand.accentInk,
    fontWeight: String(tokens.weight.bold) as '700',
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.space[3],
    marginTop: tokens.space[2],
  },
  cancelBtn: {
    paddingVertical: tokens.space[4],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
    marginTop: tokens.space[2],
  },
  cancelText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
});

// ─── ProfileScreen ────────────────────────────────────────────────────────────

/**
 * Hamburger ≡ button rendered top-left of the Profile header so the
 * supervisor can re-open the drawer from this screen and navigate to
 * any other drawer entry (My sites, Memory & rules, etc).
 *
 * Pre-this-fix: Profile had its own custom header with no menu button.
 * The QA real-user walk caught it: tapping "My sites" from the drawer
 * after navigating to Profile returned "Drawer entry not tappable"
 * because the drawer wasn't reachable from Profile at all.
 *
 * Per founder lock 2026-05-18 PM: "all things on side bar should be
 * working as expected" — every drawer screen must expose the drawer.
 */
function MenuButton(): JSX.Element {
  const { openDrawer } = useDrawer();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Menu"
      onPress={openDrawer}
      style={s.menuButton}
      hitSlop={10}
    >
      <Feather name="menu" size={22} color={tokens.color.ink.primary} />
    </TouchableOpacity>
  );
}

/**
 * @derives(ADR-0003) @derives(ADR-0007) @derives(ADR-0021)
 * @derives(master-plan §G) — supervisor surface
 */
export default function ProfileScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
  });

  const strings = useLocaleStrings();

  // ── Language state ──────────────────────────────────────────────────────────
  // Stored preference drives the row label; re-render is triggered by setting it.
  const [storedLocale, setStoredLocale] = useState<LocaleCode | ''>(() => {
    const stored = prefGet(LOCALE_KEY, '');
    if (stored === 'hi' || stored === 'te' || stored === 'en') return stored;
    return '';
  });
  const [langModalVisible, setLangModalVisible] = useState(false);

  // Resolve: stored pref > /me locale > 'en'
  const resolvedLocale: LocaleCode = (() => {
    if (storedLocale !== '') return storedLocale;
    const apiLocale = data?.user?.locale;
    if (apiLocale === 'hi' || apiLocale === 'te') return apiLocale;
    return 'en';
  })();

  const handleSelectLocale = useCallback((code: LocaleCode) => {
    // `setLocale` writes to localStorage AND fires in-process subscribers so all
    // components using `useLocaleStrings()` re-render synchronously — no extra
    // `prefSet` call needed here.
    setLocale(code);
    setStoredLocale(code);
  }, []);

  // ── Notification prefs (persisted server-side; seeded from GET /me) ──────────
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [notifError, setNotifError] = useState<string | null>(null);

  // Sync the toggles from the server whenever /me resolves/refetches.
  useEffect(() => {
    if (data?.notificationPrefs) setNotifPrefs(data.notificationPrefs);
  }, [data?.notificationPrefs]);

  async function toggleNotif(channel: keyof NotificationPrefs, val: boolean) {
    const prev = notifPrefs;
    setNotifPrefs({ ...prev, [channel]: val }); // optimistic
    setNotifError(null);
    try {
      await apiFetch('/me/notification-prefs', { method: 'PATCH', body: { [channel]: val } });
    } catch {
      // Never lie about saved state — revert and tell the user it didn't save.
      setNotifPrefs(prev);
      setNotifError("Couldn't save that. Check your connection and try again.");
    }
  }

  // ── Sign-out ────────────────────────────────────────────────────────────────
  async function handleSignOut() {
    await onAppLogout();
    router.replace('/(auth)/phone');
  }

  // ── Loading / error gates ───────────────────────────────────────────────────
  // Cluster 3 fix (QA-walkthrough 2026-05-18): render a SKELETON view
  // with the screen title + avatar placeholder + a spinner in the
  // body slot, instead of just a centered spinner. Pre-fix the user
  // saw a literally blank screen for /me's latency window. Now the
  // chrome is up immediately so the supervisor knows where they are.
  if (isLoading) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <MenuButton />
            <View style={s.avatar}>
              <Text style={s.avatarText}>·</Text>
            </View>
            <View style={s.headerText}>
              <Text style={s.greeting}>Profile</Text>
            </View>
          </View>
          <View style={s.skeletonCard}>
            <ActivityIndicator color={tokens.color.brand.accent} />
            <Text style={s.skeletonText}>Loading your profile…</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <MenuButton />
            <View style={s.avatar}>
              <Text style={s.avatarText}>·</Text>
            </View>
            <View style={s.headerText}>
              <Text style={s.greeting}>Profile</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => refetch()} style={s.errorCard}>
            <Text style={s.errorText}>Couldn't load profile. Tap to retry.</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const displayName = sanitizeDisplayName(data.user.name ?? data.user.phone);
  const firstName = displayName.split(' ')[0] ?? displayName;
  const initial = firstName[0]?.toUpperCase() ?? '?';

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <MenuButton />
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

        {/* Profile section */}
        <Section title={strings.profile.title.toUpperCase()}>
          <StatRow label="Name" value={displayName} />
          <StatRow label="Company" value={data.activeCompany.name} />
          <StatRow label="Role" value={data.activeRole} />
          <StatRow
            label="Language"
            value={localeLabel(resolvedLocale)}
            onPress={() => setLangModalVisible(true)}
            right={
              <View style={s.rowRight}>
                <Text style={row.value}>{localeLabel(resolvedLocale)}</Text>
                <Text style={row.chevron}>{' ›'}</Text>
              </View>
            }
            divider={false}
          />
        </Section>

        {/* Notification prefs — persisted server-side (Membership.notificationPrefs). */}
        <Section title="NOTIFICATIONS">
          <StatRow
            label="Push notifications"
            right={
              <Switch
                value={notifPrefs.push}
                onValueChange={(v) => toggleNotif('push', v)}
                trackColor={{
                  false: tokens.color.surface.paper3,
                  true: tokens.color.brand.accentSoft,
                }}
                thumbColor={notifPrefs.push ? tokens.color.brand.accent : tokens.color.ink.tertiary}
              />
            }
          />
          <StatRow
            label="WhatsApp"
            right={
              <Switch
                value={notifPrefs.whatsapp}
                onValueChange={(v) => toggleNotif('whatsapp', v)}
                trackColor={{
                  false: tokens.color.surface.paper3,
                  true: tokens.color.brand.accentSoft,
                }}
                thumbColor={
                  notifPrefs.whatsapp ? tokens.color.brand.accent : tokens.color.ink.tertiary
                }
              />
            }
          />
          <StatRow
            label="Email"
            divider={false}
            right={
              <Switch
                value={notifPrefs.email}
                onValueChange={(v) => toggleNotif('email', v)}
                trackColor={{
                  false: tokens.color.surface.paper3,
                  true: tokens.color.brand.accentSoft,
                }}
                thumbColor={
                  notifPrefs.email ? tokens.color.brand.accent : tokens.color.ink.tertiary
                }
              />
            }
          />
          {notifError ? <Text style={s.notifError}>{notifError}</Text> : null}
        </Section>

        <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={s.signOutText}>{strings.common.signOut}</Text>
        </TouchableOpacity>

        <Text style={s.build}>AXHY · v3 · {process.env.EXPO_PUBLIC_APP_VERSION ?? 'dev'}</Text>
      </ScrollView>

      {/* Language picker modal */}
      <LanguagePickerSheet
        visible={langModalVisible}
        current={resolvedLocale}
        onSelect={handleSelectLocale}
        onClose={() => setLangModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── Screen-level styles ──────────────────────────────────────────────────────

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
  skeletonCard: {
    marginTop: tokens.space[6],
    padding: tokens.space[6],
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r2,
    alignItems: 'center',
    gap: tokens.space[3],
  },
  skeletonText: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
  },
  errorCard: {
    marginTop: tokens.space[6],
    padding: tokens.space[6],
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r2,
    alignItems: 'center',
  },
  errorText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.brand.accent,
    textAlign: 'center',
    fontWeight: String(tokens.weight.medium) as '500',
  },
  notifError: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.semantic.bad,
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: tokens.space[1],
    marginBottom: tokens.space[6],
  },
  menuButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
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

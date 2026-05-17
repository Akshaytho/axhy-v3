/**
 * Supervisor profile screen — shows user identity, company, role, sign-out,
 * language picker, notification preferences, and switch-company (multi-tenant).
 *
 * F-006a: sign-out routes through `onAppLogout()` (ONE explicit identity
 * contract) which awaits `OneSignal.logout()` BEFORE `clearTokens()` to
 * prevent phantom-subscription leak on User A → User B switch.
 *
 * @derives(ADR-0003) @derives(ADR-0007) @derives(ADR-0021)
 * @derives(F-006a scope round-2 v6 Pick 4)
 * @derives(master-plan §G) — supervisor surface
 */

import { useState, useCallback } from 'react';
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
import { useQuery, useMutation } from '@tanstack/react-query';
import { tokens } from '@axhy/ui-tokens';
import type { MeOutput } from '@axhy/shared-schema';

import { apiFetch, ApiError } from '../../lib/api';
import { onAppLogout } from '../../lib/identity-lifecycle';
import { useLocaleStrings, setLocale } from '../../lib/i18n/use-locale';

// ─── Storage helpers (web: localStorage; native: direct localStorage unavailable but
//     non-sensitive prefs are fine in localStorage on web, and for native we mirror
//     the same synchronous-looking API the auth-store already uses for web builds) ───

const isWeb = Platform.OS === 'web';

function prefGet(key: string, defaultVal: string): string {
  if (isWeb && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key) ?? defaultVal;
  }
  return defaultVal;
}

function prefSet(key: string, value: string): void {
  if (isWeb && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCALE_KEY = 'axhy_user_locale';
const NOTIF_PUSH_KEY = 'axhy_notif_push';
const NOTIF_WHATSAPP_KEY = 'axhy_notif_whatsapp';
const NOTIF_EMAIL_KEY = 'axhy_notif_email';

type LocaleCode = 'en' | 'hi' | 'te';

const LOCALE_OPTIONS: { code: LocaleCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
];

function localeLabel(code: string): string {
  return LOCALE_OPTIONS.find((o) => o.code === code)?.label ?? 'English';
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

// ─── SwitchCompanySheet ───────────────────────────────────────────────────────

/**
 * Confirmation modal for switching active company.
 * Calls POST /auth/switch-company when confirmed.
 * If the endpoint is absent, surfaces an error line instead of failing silently.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function SwitchCompanySheet({
  companyId,
  companyName,
  onClose,
  onSwitched,
}: {
  companyId: string | null;
  companyName: string;
  onClose: () => void;
  onSwitched: () => void;
}) {
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>('/auth/switch-company', {
        method: 'POST',
        body: JSON.stringify({ companyId }),
      }),
    onSuccess: () => {
      setErrorLine(null);
      onSwitched();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) {
        setErrorLine('Multi-company switch coming soon');
      } else if (err instanceof ApiError && err.status === 405) {
        setErrorLine('Multi-company switch coming soon');
      } else if (err instanceof Error) {
        setErrorLine(err.message);
      } else {
        setErrorLine('Could not switch company. Try again.');
      }
    },
  });

  function handleClose() {
    setErrorLine(null);
    mutation.reset();
    onClose();
  }

  return (
    <Modal
      visible={companyId !== null}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      onDismiss={() => {
        setErrorLine(null);
        mutation.reset();
      }}
    >
      <Pressable style={modal.backdrop} onPress={handleClose}>
        <Pressable style={modal.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={modal.handle} />
          <Text style={modal.title}>Switch to {companyName}?</Text>
          <Text style={modal.subtitle}>
            You will be signed into this company. You can switch back at any time.
          </Text>

          {errorLine ? <Text style={modal.errorLine}>{errorLine}</Text> : null}

          <View style={modal.actions}>
            <Pressable style={modal.cancelBtn2} onPress={handleClose}>
              <Text style={modal.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[modal.confirmBtn, mutation.isPending && modal.confirmBusy]}
              onPress={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <ActivityIndicator color={tokens.color.surface.card} />
              ) : (
                <Text style={modal.confirmText}>Switch</Text>
              )}
            </Pressable>
          </View>
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
  errorLine: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.semantic.bad,
    marginBottom: tokens.space[3],
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
  cancelBtn2: {
    flex: 1,
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
  confirmBtn: {
    flex: 1.4,
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBusy: { opacity: 0.7 },
  confirmText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.surface.card,
  },
});

// ─── ProfileScreen ────────────────────────────────────────────────────────────

/**
 * @derives(ADR-0003) @derives(ADR-0007) @derives(ADR-0021)
 * @derives(master-plan §G) — supervisor surface
 */
export default function ProfileScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
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

  // ── Notification prefs state ────────────────────────────────────────────────
  // Local-only this slice; backend membership.notificationPrefs wire-up is a follow-up.
  const [notifPush, setNotifPush] = useState(() => prefGet(NOTIF_PUSH_KEY, 'on') === 'on');
  const [notifWhatsapp, setNotifWhatsapp] = useState(
    () => prefGet(NOTIF_WHATSAPP_KEY, 'on') === 'on',
  );
  const [notifEmail, setNotifEmail] = useState(() => prefGet(NOTIF_EMAIL_KEY, 'on') === 'on');

  function handleTogglePush(val: boolean) {
    setNotifPush(val);
    prefSet(NOTIF_PUSH_KEY, val ? 'on' : 'off');
  }

  function handleToggleWhatsapp(val: boolean) {
    setNotifWhatsapp(val);
    prefSet(NOTIF_WHATSAPP_KEY, val ? 'on' : 'off');
  }

  function handleToggleEmail(val: boolean) {
    setNotifEmail(val);
    prefSet(NOTIF_EMAIL_KEY, val ? 'on' : 'off');
  }

  // ── Switch-company state ────────────────────────────────────────────────────
  const [switchTarget, setSwitchTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Sign-out ────────────────────────────────────────────────────────────────
  async function handleSignOut() {
    await onAppLogout();
    router.replace('/(auth)/phone');
  }

  // ── Loading / error gates ───────────────────────────────────────────────────
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

  // Non-active memberships for switch-company section
  const otherMemberships = data.memberships.filter((m) => m.companyId !== data.activeCompany.id);
  const hasMultipleCompanies = otherMemberships.length > 0;

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

        {/* Notification prefs — Local-only this slice; backend membership.notificationPrefs wire-up is a follow-up. */}
        <Section title="NOTIFICATIONS">
          <StatRow
            label="Push notifications"
            right={
              <Switch
                value={notifPush}
                onValueChange={handleTogglePush}
                trackColor={{
                  false: tokens.color.surface.paper3,
                  true: tokens.color.brand.accentSoft,
                }}
                thumbColor={notifPush ? tokens.color.brand.accent : tokens.color.ink.tertiary}
              />
            }
          />
          <StatRow
            label="WhatsApp"
            right={
              <Switch
                value={notifWhatsapp}
                onValueChange={handleToggleWhatsapp}
                trackColor={{
                  false: tokens.color.surface.paper3,
                  true: tokens.color.brand.accentSoft,
                }}
                thumbColor={notifWhatsapp ? tokens.color.brand.accent : tokens.color.ink.tertiary}
              />
            }
          />
          <StatRow
            label="Email"
            divider={false}
            right={
              <Switch
                value={notifEmail}
                onValueChange={handleToggleEmail}
                trackColor={{
                  false: tokens.color.surface.paper3,
                  true: tokens.color.brand.accentSoft,
                }}
                thumbColor={notifEmail ? tokens.color.brand.accent : tokens.color.ink.tertiary}
              />
            }
          />
        </Section>

        {/* Switch company — only rendered when user has > 1 membership */}
        {hasMultipleCompanies && (
          <Section title="SWITCH COMPANY">
            {otherMemberships.map((m, i) => (
              <StatRow
                key={m.companyId}
                label={m.companyName}
                value={m.role}
                divider={i < otherMemberships.length - 1}
                onPress={() => setSwitchTarget({ id: m.companyId, name: m.companyName })}
                right={
                  <View style={s.rowRight}>
                    <Text style={row.value}>{m.role}</Text>
                    <Text style={row.chevron}>{' ›'}</Text>
                  </View>
                }
              />
            ))}
          </Section>
        )}

        <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={s.signOutText}>{strings.common.signOut}</Text>
        </TouchableOpacity>

        <Text style={s.build}>AXHY · v3 · BUILD 2026.05.08</Text>
      </ScrollView>

      {/* Language picker modal */}
      <LanguagePickerSheet
        visible={langModalVisible}
        current={resolvedLocale}
        onSelect={handleSelectLocale}
        onClose={() => setLangModalVisible(false)}
      />

      {/* Switch-company confirmation modal */}
      {switchTarget !== null && (
        <SwitchCompanySheet
          companyId={switchTarget.id}
          companyName={switchTarget.name}
          onClose={() => setSwitchTarget(null)}
          onSwitched={() => refetch()}
        />
      )}
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

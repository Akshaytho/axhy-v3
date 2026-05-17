/**
 * Minimal locale-aware string map for the supervisor mobile app.
 *
 * Design rationale: i18next is in package.json but was never initialized.
 * A plain map is simpler, has zero runtime overhead, needs no async init,
 * and is trivially tree-shaken. If the product ever needs plurals or
 * dynamic namespaces, migrate to i18next then.
 *
 * Supported locales: en · hi · te
 *
 * Translation notes:
 *   - Hindi / Telugu strings were authored with care; review with native speaker
 *     before shipping to production.
 *   - "Namaste" is left as-is across all locales — it is the established
 *     greeting in the product already and is cross-culturally understood.
 *
 * @derives(master-plan §G) — supervisor surface
 * @derives(ADR-0003)
 */

// ─── Locale type ─────────────────────────────────────────────────────────────

/** Supported locale codes. */
export type LocaleCode = 'en' | 'hi' | 'te';

/** The locale storage key written by the Profile language picker. */
export const LOCALE_STORAGE_KEY = 'axhy_user_locale' as const;

// ─── String map shape ─────────────────────────────────────────────────────────

/** Flat string map for one locale. Every key is required — no optional gaps. */
export type LocaleStrings = {
  /** Tab bar labels */
  tabs: {
    today: string;
    decisions: string;
    activity: string;
    chat: string;
    profile: string;
  };
  /** Today screen */
  today: {
    /** Screen title in the TopAppBar. */
    title: string;
    /**
     * Returns the weekday-and-time subtitle string formatted in the locale.
     *
     * Example (en): "MONDAY · 09:14"
     */
    subtitleWeekday: (d: Date) => string;
  };
  /** Chat screen */
  chat: {
    title: string;
    /** Greeting line; `{name}` is replaced by the caller with the first name. */
    greeting: string;
  };
  /** Decisions screen */
  decisions: {
    title: string;
  };
  /** Activity screen */
  activity: {
    title: string;
  };
  /** Profile screen */
  profile: {
    title: string;
  };
  /** Common / shared strings */
  common: {
    signOut: string;
    cancel: string;
    confirm: string;
  };
};

// ─── BCP 47 locale IDs used for Intl formatters ───────────────────────────────

const BCP47: Record<LocaleCode, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
};

/**
 * Builds the weekday-time subtitle string.
 *
 * Format: "WEEKDAY · HH:MM" (weekday uppercased, time in 24-hour).
 * The weekday is locale-aware; the separator and time format are constant
 * so supervisors can always find the time regardless of language.
 */
function makeSubtitle(locale: LocaleCode): (d: Date) => string {
  const bcp = BCP47[locale];
  return (d: Date) => {
    const weekday = d.toLocaleDateString(bcp, { weekday: 'long' }).toUpperCase();
    const time = d.toLocaleTimeString(bcp, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${weekday} · ${time}`;
  };
}

// ─── String maps ─────────────────────────────────────────────────────────────

/** English (default) strings. */
const EN: LocaleStrings = {
  tabs: {
    today: 'Today',
    decisions: 'Decisions',
    activity: 'Activity',
    chat: 'Chat',
    profile: 'Profile',
  },
  today: {
    title: "Today's plan",
    subtitleWeekday: makeSubtitle('en'),
  },
  chat: {
    title: 'Chat',
    greeting: 'Namaste, {name}.',
  },
  decisions: {
    title: 'Decisions',
  },
  activity: {
    title: 'Activity',
  },
  profile: {
    title: 'Profile',
  },
  common: {
    signOut: 'Sign out',
    cancel: 'Cancel',
    confirm: 'Confirm',
  },
};

/**
 * Hindi strings.
 * Review with native speaker before production release.
 */
const HI: LocaleStrings = {
  tabs: {
    today: 'आज',
    decisions: 'निर्णय',
    activity: 'गतिविधि',
    chat: 'बातचीत',
    profile: 'प्रोफ़ाइल',
  },
  today: {
    title: 'आज की योजना',
    subtitleWeekday: makeSubtitle('hi'),
  },
  chat: {
    title: 'बातचीत',
    greeting: 'Namaste, {name}.',
  },
  decisions: {
    title: 'निर्णय',
  },
  activity: {
    title: 'गतिविधि',
  },
  profile: {
    title: 'प्रोफ़ाइल',
  },
  common: {
    signOut: 'साइन आउट',
    cancel: 'रद्द करें',
    confirm: 'पुष्टि करें',
  },
};

/**
 * Telugu strings.
 * Review with native speaker before production release.
 */
const TE: LocaleStrings = {
  tabs: {
    today: 'నేడు',
    decisions: 'నిర్ణయాలు',
    activity: 'కార్యకలాపం',
    chat: 'చాట్',
    profile: 'ప్రొఫైల్',
  },
  today: {
    title: 'నేటి ప్రణాళిక',
    subtitleWeekday: makeSubtitle('te'),
  },
  chat: {
    title: 'చాట్',
    greeting: 'Namaste, {name}.',
  },
  decisions: {
    title: 'నిర్ణయాలు',
  },
  activity: {
    title: 'కార్యకలాపం',
  },
  profile: {
    title: 'ప్రొఫైల్',
  },
  common: {
    signOut: 'సైన్ అవుట్',
    cancel: 'రద్దు చేయండి',
    confirm: 'నిర్ధారించండి',
  },
};

/** All locale maps indexed by code. */
export const STRINGS: Record<LocaleCode, LocaleStrings> = {
  en: EN,
  hi: HI,
  te: TE,
};

/**
 * Returns the string map for `code`, falling back to English if the code
 * is not recognised (guards against stale localStorage values).
 */
export function getStrings(code: string): LocaleStrings {
  if (code === 'hi' || code === 'te') return STRINGS[code];
  return STRINGS.en;
}

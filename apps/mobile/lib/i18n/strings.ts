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
    /** Text input placeholder on the capture footer. */
    inputPlaceholder: string;
    /** Inline banner while a held-mic recording is uploading + Whisper resolving. */
    transcribingLabel: string;
    /** Header on the transcript reveal banner once words land. */
    transcriptHeadingLabel: string;
    /** Photo attach button accessibility label. */
    attachPhotoLabel: string;
    /** Eyebrow on the amend mode banner. */
    amendBannerTitle: string;
    /** Dismiss-amend button accessibility label. */
    amendDismissLabel: string;
    /** "View thread" chip on the complaint confirmation bubble. */
    viewComplaintThread: string;
    /** Error banner when photo upload endpoint is not yet deployed. */
    photoUploadUnavailable: string;
    /** Error banner when expo-image-picker isn't shipped in this build. */
    photoPickerUnavailable: string;
    /** Error when supervisor tries to attach more than 4 photos. */
    photoMaxReached: string;
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
  /**
   * Replacement picker (F28) — supervisor-side surface for sending a
   * cover invite to ONE candidate worker. 2-minute TTL countdown.
   *
   * @derives(master-plan §P.4)
   * @derives(feedback_replacement_invite_single_recipient.md)
   */
  replacement: {
    /** Eyebrow above the screen title in the TopAppBar. */
    eyebrow: string;
    /** Screen title. */
    title: string;
    /** Context line — "Replacing for: {name}" when an original worker is set. */
    replacingFor: (name: string) => string;
    /** Search placeholder over the candidate list. */
    searchPlaceholder: string;
    /** Empty-state when no candidates match the filter. */
    noCandidates: string;
    /** Row meta — "On {site}". Used when the candidate is currently on a different site today. */
    onSite: (site: string) => string;
    /** Row meta — "Not assigned today". */
    notAssignedToday: string;
    /** Confirm sheet — title "Send invite to {name}?". */
    confirmTitle: (name: string) => string;
    /** Confirm sheet — body explaining the 2-min countdown. */
    confirmBody: string;
    /** Confirm sheet — primary button "Send invite". */
    confirmSend: string;
    /** Waiting screen — title shown while invite is PENDING. */
    waitingTitle: (name: string) => string;
    /** Waiting screen — sub-line "Waiting for response · {mm}:{ss}". */
    waitingSubtitle: (mmss: string) => string;
    /** Waiting screen — cancel button. */
    cancelInvite: string;
    /** Outcome — accepted, "{name} accepted". */
    acceptedTitle: (name: string) => string;
    /** Outcome — accepted, body. */
    acceptedBody: string;
    /** Outcome — accepted, back-to-Today button. */
    backToToday: string;
    /** Outcome — declined / expired, header. */
    declinedTitle: (name: string) => string;
    expiredTitle: (name: string) => string;
    cancelledTitle: (name: string) => string;
    /** Outcome — try someone else button. */
    tryAnother: string;
    /** WorkerRow long-press menu — Find replacement. */
    findReplacement: string;
    /** WorkerRow long-press menu — Cancel. */
    longPressCancel: string;
    /** Error envelope — generic. */
    genericError: string;
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
    inputPlaceholder: 'Type or hold the mic to speak…',
    transcribingLabel: 'Transcribing',
    transcriptHeadingLabel: 'Heard',
    attachPhotoLabel: 'Attach photo',
    amendBannerTitle: 'Editing decision',
    amendDismissLabel: 'Stop editing decision',
    viewComplaintThread: 'View thread',
    photoUploadUnavailable: 'Photo upload is not yet available. Please try again later.',
    photoPickerUnavailable:
      'Photo attach is not available in this build. Please update the app or use the web supervisor surface for now.',
    photoMaxReached: 'Maximum of 4 photos per message.',
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
  replacement: {
    eyebrow: 'REPLACEMENT',
    title: 'Pick someone to cover',
    replacingFor: (name) => `Replacing for: ${name}`,
    searchPlaceholder: 'Search workers by name',
    noCandidates: 'No workers match. Clear search and try again.',
    onSite: (site) => `On ${site}`,
    notAssignedToday: 'Not assigned today',
    confirmTitle: (name) => `Send invite to ${name}?`,
    confirmBody:
      'They have 2 minutes to accept. If they decline or do not respond in time, you can try someone else.',
    confirmSend: 'Send invite',
    waitingTitle: (name) => `Invite sent to ${name}`,
    waitingSubtitle: (mmss) => `Waiting for response · ${mmss}`,
    cancelInvite: 'Cancel invite',
    acceptedTitle: (name) => `${name} accepted`,
    acceptedBody: 'Shift is covered. They will see the assignment on their phone.',
    backToToday: 'Back to Today',
    declinedTitle: (name) => `${name} declined`,
    expiredTitle: (name) => `${name} did not respond in time`,
    cancelledTitle: (name) => `Invite to ${name} cancelled`,
    tryAnother: 'Try someone else',
    findReplacement: 'Find replacement',
    longPressCancel: 'Cancel',
    genericError: 'Could not reach the server. Pull down to retry.',
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
    inputPlaceholder: 'टाइप करें या बोलने के लिए माइक दबाए रखें…',
    transcribingLabel: 'सुन रहे हैं',
    transcriptHeadingLabel: 'सुना',
    attachPhotoLabel: 'फ़ोटो जोड़ें',
    amendBannerTitle: 'निर्णय संपादित करें',
    amendDismissLabel: 'संपादन बंद करें',
    viewComplaintThread: 'वार्ता खोलें',
    photoUploadUnavailable: 'फ़ोटो अपलोड अभी उपलब्ध नहीं है। बाद में फिर कोशिश करें।',
    photoPickerUnavailable:
      'इस बिल्ड में फ़ोटो अटैच उपलब्ध नहीं है। ऐप अपडेट करें या वेब सर्फ़ेस का उपयोग करें।',
    photoMaxReached: 'प्रति संदेश अधिकतम 4 फ़ोटो।',
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
  replacement: {
    eyebrow: 'रिप्लेसमेंट',
    title: 'कवर के लिए किसी को चुनें',
    replacingFor: (name) => `${name} के लिए रिप्लेसमेंट`,
    searchPlaceholder: 'नाम से खोजें',
    noCandidates: 'कोई वर्कर नहीं मिला। खोज साफ़ करें और फिर से कोशिश करें।',
    onSite: (site) => `${site} पर है`,
    notAssignedToday: 'आज असाइन नहीं है',
    confirmTitle: (name) => `${name} को इनवाइट भेजें?`,
    confirmBody:
      'उनके पास स्वीकार करने के लिए 2 मिनट हैं। यदि वे मना करते हैं या समय पर जवाब नहीं देते, तो आप किसी और को आज़मा सकते हैं।',
    confirmSend: 'इनवाइट भेजें',
    waitingTitle: (name) => `इनवाइट ${name} को भेजा गया`,
    waitingSubtitle: (mmss) => `जवाब का इंतज़ार · ${mmss}`,
    cancelInvite: 'इनवाइट रद्द करें',
    acceptedTitle: (name) => `${name} ने स्वीकार किया`,
    acceptedBody: 'शिफ्ट कवर हो गई। उन्हें असाइनमेंट उनके फ़ोन पर दिखेगा।',
    backToToday: 'आज पर वापस जाएँ',
    declinedTitle: (name) => `${name} ने मना किया`,
    expiredTitle: (name) => `${name} ने समय पर जवाब नहीं दिया`,
    cancelledTitle: (name) => `${name} का इनवाइट रद्द हो गया`,
    tryAnother: 'किसी और को आज़माएँ',
    findReplacement: 'रिप्लेसमेंट खोजें',
    longPressCancel: 'रद्द',
    genericError: 'सर्वर से संपर्क नहीं हो पा रहा। फिर से कोशिश करें।',
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
    inputPlaceholder: 'టైప్ చేయండి లేదా మాట్లాడటానికి మైక్ నొక్కి ఉంచండి…',
    transcribingLabel: 'వింటున్నాం',
    transcriptHeadingLabel: 'విన్నాం',
    attachPhotoLabel: 'ఫోటో జోడించండి',
    amendBannerTitle: 'నిర్ణయాన్ని సవరించండి',
    amendDismissLabel: 'సవరణ ఆపు',
    viewComplaintThread: 'సంభాషణ చూడండి',
    photoUploadUnavailable: 'ఫోటో అప్‌లోడ్ ఇంకా అందుబాటులో లేదు. తర్వాత మళ్లీ ప్రయత్నించండి.',
    photoPickerUnavailable:
      'ఈ బిల్డ్‌లో ఫోటో అటాచ్ అందుబాటులో లేదు. యాప్‌ని అప్‌డేట్ చేయండి లేదా వెబ్ సర్ఫేస్ ఉపయోగించండి.',
    photoMaxReached: 'ఒక సందేశానికి గరిష్ఠంగా 4 ఫోటోలు.',
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
  replacement: {
    eyebrow: 'రీప్లేస్‌మెంట్',
    title: 'కవర్ చేయడానికి ఎవరినైనా ఎంచుకోండి',
    replacingFor: (name) => `${name} స్థానంలో`,
    searchPlaceholder: 'పేరుతో వెతకండి',
    noCandidates: 'ఎవరూ సరిపోలలేదు. వెతకడం క్లియర్ చేసి మళ్ళీ ప్రయత్నించండి.',
    onSite: (site) => `${site} వద్ద ఉన్నారు`,
    notAssignedToday: 'ఈ రోజు అసైన్ కాలేదు',
    confirmTitle: (name) => `${name}కి ఇన్వైట్ పంపాలా?`,
    confirmBody:
      'వారికి ఆమోదించడానికి 2 నిమిషాలు ఉన్నాయి. వారు తిరస్కరిస్తే లేదా సమయానికి స్పందించకపోతే, మీరు మరొకరిని ప్రయత్నించవచ్చు.',
    confirmSend: 'ఇన్వైట్ పంపండి',
    waitingTitle: (name) => `${name}కి ఇన్వైట్ పంపబడింది`,
    waitingSubtitle: (mmss) => `స్పందన కోసం వేచి · ${mmss}`,
    cancelInvite: 'ఇన్వైట్ రద్దు చేయండి',
    acceptedTitle: (name) => `${name} ఆమోదించారు`,
    acceptedBody: 'షిఫ్ట్ కవర్ అయింది. వారికి అసైన్‌మెంట్ ఫోన్‌లో కనిపిస్తుంది.',
    backToToday: 'నేటికి తిరిగి వెళ్ళండి',
    declinedTitle: (name) => `${name} తిరస్కరించారు`,
    expiredTitle: (name) => `${name} సమయానికి స్పందించలేదు`,
    cancelledTitle: (name) => `${name}కి ఇన్వైట్ రద్దు అయింది`,
    tryAnother: 'మరొకరిని ప్రయత్నించండి',
    findReplacement: 'రీప్లేస్‌మెంట్ కనుగొనండి',
    longPressCancel: 'రద్దు',
    genericError: 'సర్వర్‌ను చేరుకోలేకపోయాము. మళ్ళీ ప్రయత్నించండి.',
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

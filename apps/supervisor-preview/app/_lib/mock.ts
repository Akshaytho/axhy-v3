/**
 * Mock data for the supervisor preview prototype.
 *
 * Panel-locked names + scenarios per founder approval 2026-05-01.
 * No real PII, no DB lookup. Pure TypeScript constants.
 *
 * @derives(master-plan §G)
 */

export const SUPERVISOR = {
  id: 'sup_suresh',
  name: 'Suresh',
  phone: '+91 89 *** ***86',
  language: 'mixed' as const,
  workingAt: 'Reddy Cleaning Services',
};

export const HR = {
  id: 'hr_kavitha',
  name: 'Kavitha',
};

export type Site = {
  id: string;
  name: string;
  shortName: string;
  type: 'apartment' | 'it_park' | 'hospital' | 'mall' | 'school';
  workersAssigned: number;
  todayStatus: 'covered' | 'short_staffed' | 'flagged' | 'pending';
  quirk?: string;
};

export const SITES: Site[] = [
  {
    id: 'site_brigade',
    name: 'Brigade Apartments',
    shortName: 'Brigade',
    type: 'apartment',
    workersAssigned: 4,
    todayStatus: 'covered',
    quirk: 'Block A access only after 6 AM',
  },
  {
    id: 'site_itpark_c',
    name: 'IT Park C',
    shortName: 'IT Park C',
    type: 'it_park',
    workersAssigned: 6,
    todayStatus: 'short_staffed',
    quirk: 'Strict gate pass check; supervisor needed at entry',
  },
  {
    id: 'site_apollo',
    name: 'Apollo Hospital A wing',
    shortName: 'Apollo A',
    type: 'hospital',
    workersAssigned: 5,
    todayStatus: 'covered',
    quirk: 'Bagged uniform required; PPE check at entry',
  },
  {
    id: 'site_phoenix',
    name: 'Phoenix Mall',
    shortName: 'Phoenix',
    type: 'mall',
    workersAssigned: 3,
    todayStatus: 'flagged',
    quirk: 'Building manager complaint pending — Block C',
  },
  {
    id: 'site_central_school',
    name: 'Central School',
    shortName: 'Central',
    type: 'school',
    workersAssigned: 2,
    todayStatus: 'pending',
    quirk: 'Closed Saturdays; only morning shift weekdays',
  },
];

export type Worker = {
  id: string;
  name: string;
  reliability: 'reliable' | 'new' | 'watching';
  preferredShift: 'morning' | 'evening' | 'flex';
  todayStatus: 'present' | 'absent_notified' | 'absent_no_call' | 'off';
  assignedSite?: string;
  note?: string;
};

export const WORKERS: Worker[] = [
  {
    id: 'w_ravi',
    name: 'Ravi',
    reliability: 'reliable',
    preferredShift: 'morning',
    todayStatus: 'present',
    assignedSite: 'site_brigade',
  },
  {
    id: 'w_anil',
    name: 'Anil',
    reliability: 'reliable',
    preferredShift: 'morning',
    todayStatus: 'present',
    assignedSite: 'site_itpark_c',
    note: 'Never absent without notice',
  },
  {
    id: 'w_sarita',
    name: 'Sarita',
    reliability: 'reliable',
    preferredShift: 'morning',
    todayStatus: 'absent_notified',
    note: 'Morning shift only — has kids',
  },
  {
    id: 'w_mukesh',
    name: 'Mukesh',
    reliability: 'watching',
    preferredShift: 'flex',
    todayStatus: 'absent_no_call',
    assignedSite: 'site_itpark_c',
    note: "Don't pair with Ramesh",
  },
  {
    id: 'w_priya',
    name: 'Priya',
    reliability: 'reliable',
    preferredShift: 'morning',
    todayStatus: 'present',
    assignedSite: 'site_apollo',
  },
  {
    id: 'w_ramesh',
    name: 'Ramesh',
    reliability: 'new',
    preferredShift: 'morning',
    todayStatus: 'present',
    assignedSite: 'site_brigade',
    note: 'First week — still learning',
  },
  {
    id: 'w_lakshmi',
    name: 'Lakshmi',
    reliability: 'reliable',
    preferredShift: 'evening',
    todayStatus: 'off',
  },
  {
    id: 'w_vinod',
    name: 'Vinod',
    reliability: 'reliable',
    preferredShift: 'morning',
    todayStatus: 'present',
    assignedSite: 'site_phoenix',
  },
  {
    id: 'w_asha',
    name: 'Asha',
    reliability: 'reliable',
    preferredShift: 'morning',
    todayStatus: 'present',
    assignedSite: 'site_apollo',
  },
  {
    id: 'w_karthik',
    name: 'Karthik',
    reliability: 'reliable',
    preferredShift: 'evening',
    todayStatus: 'present',
    assignedSite: 'site_phoenix',
  },
];

export type DecisionTier = 'NOTE' | 'OPERATIONAL' | 'PERSONNEL' | 'EMPLOYMENT';

export type Decision = {
  id: string;
  tier: DecisionTier;
  summary: string;
  consequence?: string;
  status: 'pending' | 'applied' | 'undone';
  createdAt: string;
};

export const TODAYS_DECISIONS: Decision[] = [
  {
    id: 'dec_1',
    tier: 'NOTE',
    summary: 'Block C complaint at Phoenix logged',
    status: 'applied',
    createdAt: '08:14',
  },
  {
    id: 'dec_2',
    tier: 'OPERATIONAL',
    summary: 'Vinod moved from Phoenix to Apollo for the morning',
    consequence: 'Apollo gets +1 worker, Phoenix at 2/3',
    status: 'applied',
    createdAt: '08:42',
  },
  {
    id: 'dec_3',
    tier: 'PERSONNEL',
    summary: "Sarita's leave for May 1 approved",
    consequence: 'Sarita pay this week drops ₹500',
    status: 'applied',
    createdAt: '09:05',
  },
  {
    id: 'dec_4',
    tier: 'NOTE',
    summary: 'Mukesh marked as no-call no-show — flagged for HR',
    status: 'pending',
    createdAt: '09:18',
  },
];

export type ChatMessage = {
  id: string;
  role: 'supervisor' | 'ai';
  text: string;
  language?: 'hi' | 'en' | 'te' | 'mixed';
  timestamp: string;
  decision?: Decision;
};

export type Chat = {
  id: string;
  title: string;
  startedAt: string;
  messages: ChatMessage[];
  state: 'active' | 'wrapped' | 'deleted';
};

export const TODAYS_CHATS: Chat[] = [
  {
    id: 'chat_morning',
    title: 'Morning rounds',
    startedAt: '06:42',
    state: 'active',
    messages: [
      {
        id: 'm1',
        role: 'ai',
        text: "Today's context loaded at 3:30 AM IST. Suresh ji, 5 sites, 10 workers. Ready when you are.",
        language: 'en',
        timestamp: '06:42',
      },
      {
        id: 'm2',
        role: 'supervisor',
        text: 'Sarita ki leave approve karo, kal nahi aayegi',
        language: 'hi',
        timestamp: '06:44',
      },
      {
        id: 'm3',
        role: 'ai',
        text: 'Sarita ki leave for May 1 approve karu? Iss week pay ₹500 kam ho jayega.',
        language: 'mixed',
        timestamp: '06:44',
        decision: {
          id: 'dec_3',
          tier: 'PERSONNEL',
          summary: "Sarita's leave for May 1 approved",
          consequence: 'Sarita pay this week drops ₹500',
          status: 'applied',
          createdAt: '06:44',
        },
      },
      {
        id: 'm5',
        role: 'ai',
        text: 'Done. Sarita ki leave applied. HR ko notification gayi.',
        language: 'mixed',
        timestamp: '06:45',
      },
    ],
  },
  {
    id: 'chat_phoenix',
    title: 'Phoenix complaint',
    startedAt: '08:10',
    state: 'active',
    messages: [
      {
        id: 'p1',
        role: 'supervisor',
        text: 'Phoenix Block C mein complaint aaya hai',
        language: 'hi',
        timestamp: '08:10',
      },
      {
        id: 'p2',
        role: 'ai',
        text: 'Building manager se kya bola? Note kar du Phoenix ke context mein?',
        language: 'mixed',
        timestamp: '08:10',
      },
      {
        id: 'p3',
        role: 'supervisor',
        text: 'Block C ka floor wet ho gaya hai aur signage nahi tha',
        language: 'hi',
        timestamp: '08:13',
      },
      {
        id: 'p4',
        role: 'ai',
        text: 'Noted — Phoenix Block C: wet floor + missing signage 08:13. Tomorrow se signage check ko routine mein add kar du?',
        language: 'mixed',
        timestamp: '08:14',
        decision: {
          id: 'dec_1',
          tier: 'NOTE',
          summary: 'Block C complaint at Phoenix logged',
          status: 'applied',
          createdAt: '08:14',
        },
      },
    ],
  },
];

export type HRUpdate = {
  id: string;
  fromName: string;
  title: string;
  body: string;
  postedAt: string;
  ackRequired: boolean;
  ackTypedWords?: string;
  ackedAt?: string;
};

export const HR_UPDATES: HRUpdate[] = [
  {
    id: 'hr_1',
    fromName: 'Kavitha (HR)',
    title: 'New attendance rule from May 5',
    body: "Workers absent without call for 2 days will be flagged automatically. Please type 'agreed kavitha' to acknowledge.",
    postedAt: 'Yesterday, 6:12 PM',
    ackRequired: true,
    ackTypedWords: 'agreed kavitha',
  },
  {
    id: 'hr_2',
    fromName: 'Kavitha (HR)',
    title: 'Diwali week schedule',
    body: 'Skeleton crew Oct 22-24. Pre-approve worker leave by Oct 15. Reply with your headcount plan.',
    postedAt: 'Yesterday, 11:30 AM',
    ackRequired: false,
    ackedAt: 'Yesterday, 11:34 AM',
  },
];

export type PersonalRules = {
  sites: string;
  workers: string;
  escalation: string;
  style: string;
  language: 'hi' | 'en' | 'te' | 'mixed';
};

export const COMPANY_SUPERVISOR_RULES = `
- All worker absences must be logged before 9 AM IST.
- Site complaints from building managers go to supervisor first, escalate to HR if unresolved within 24 hours.
- No worker swaps after 7 AM without supervisor confirm.
- Diwali / Eid / Christmas weeks: skeleton crew approved by HR in advance.
- Worker pay is calculated weekly. Half-day deductions are ₹500.
`.trim();

export const PERSONAL_RULES_DEFAULT: PersonalRules = {
  sites:
    'Brigade — Block A access only after 6 AM. IT Park C — strict gate pass, I usually walk in with the team. Apollo — bagged uniform mandatory. Phoenix — Block C BM is strict, his name is Mr Rao. Central School — Saturdays off, mornings only.',
  workers:
    'Anil — never absent without notice, can lead a team. Sarita — morning shift only, has kids, prefers Brigade. Mukesh — watching, do not pair with Ramesh. Ramesh — first week, still learning. Lakshmi — evening shift, very reliable.',
  escalation:
    'I am at sites 6-10 AM and 4-7 PM. WhatsApp first, call only if urgent. 2+ workers absent without call → call HR Kavitha immediately. Building manager complaint → me direct, then HR if unresolved. Equipment / supplies issue → bypass HR, contact procurement (Naveen).',
  style:
    "I mix Hindi, English, and Telugu freely. Don't translate or 'fix' my mixing. Use 'sir' for clients but 'bhai' for workers. Keep replies short — I read on the move. Don't add corporate fluff like 'great job' or 'happy to help'.",
  language: 'mixed',
};

export type TimeOfDay = '7am' | '11am' | '3pm' | '11pm';

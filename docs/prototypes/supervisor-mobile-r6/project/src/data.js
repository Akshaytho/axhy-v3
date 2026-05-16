// Mock data for the supervisor mobile prototype. All values intentionally realistic
// to the canonical Ravi persona (Hyderabad, Surya cleaning co.) per spec §1.
//
// Updated 2026-05-11 for operations-first reframing:
// - Tab structure: Today → Decisions → Activity → Chat → Profile
// - Decisions Workspace persists pending SupervisorDecisions (NOT inline in chat)
// - Activity / Proof renders AuditEvent timeline with structured filters
// - Temp mode is per-Membership scope
// - Worker.state still uses Visit-derived labels for backwards-compat with today.jsx;
//   new attendanceByWorker map gives the Attendance-truth view for refactored Today.

window.AxhyData = {
  personas: {
    ravi: {
      name: 'Ravi Kumar',
      initial: 'R',
      phone: '+91 98480 12349',
      locale: 'en',
      company: 'Surya Facility Services',
      companyShort: 'Surya',
      role: 'SUPERVISOR',
      memberSince: 'March 2025',
      sitesActive: 3,
      workersActive: 14,
      teamSize: 35,
      siteCount: 8,
      availableRoles: ['SUPERVISOR', 'WORKER'],
    },
    ramesh: {
      name: 'Ramesh Iyer',
      initial: 'R',
      phone: '+91 99001 22310',
      locale: 'en',
      company: 'Bluestar Hospitality',
      companyShort: 'Bluestar',
      role: 'SUPERVISOR',
      memberSince: 'August 2024',
      sitesActive: 2,
      workersActive: 9,
      teamSize: 22,
      siteCount: 5,
      availableRoles: ['SUPERVISOR'],
    },
  },

  // Voice usage stats — qualitative tier never numeric per spec §3
  voice: {
    ratioToday: 0.84,
    ratio30: 0.78,
    minutes30: 47,
    parseTier: 'excellent', // excellent | good | review | flagged
    applyRate: 0.92,
    // 30-day daily voice ratio for sparkline (most recent on right)
    sparkline: [
      0.62, 0.71, 0.65, 0.74, 0.69, 0.78, 0.73, 0.77, 0.81, 0.74, 0.79, 0.83, 0.76, 0.8, 0.85, 0.78,
      0.82, 0.86, 0.79, 0.83, 0.81, 0.85, 0.78, 0.82, 0.87, 0.8, 0.84, 0.79, 0.83, 0.84,
    ],
    // Hour-of-day voice activity for "today" bar chart (06:00 → 22:00)
    todayBars: [
      0.4, 0.85, 0.65, 0.55, 0.2, 0.25, 0.1, 0.45, 0.75, 0.5, 0.3, 0.65, 0.55, 0.35, 0.2, 0.1, 0.05,
    ],
  },

  decisions: [
    {
      id: 'd1',
      tier: 'personnel',
      surface: 'heavy',
      when: '2 min ago',
      title: "Approve Sarita's 5-day leave?",
      body: 'Family wedding, Mar 19–23. Apollo Hospital site needs daily cover.',
      multiDay: {
        startDate: 'Mar 19',
        endDate: 'Mar 23',
        days: [
          {
            day: 'Wed Mar 19',
            site: 'Apollo Hospital',
            shift: '06:00–14:00',
            candidates: ['Vinod K', 'Mukesh Y', 'Lakshmi B'],
          },
          {
            day: 'Thu Mar 20',
            site: 'Apollo Hospital',
            shift: '06:00–14:00',
            candidates: ['Vinod K', 'Mukesh Y'],
          },
          {
            day: 'Fri Mar 21',
            site: 'Apollo Hospital',
            shift: '06:00–14:00',
            candidates: ['Mukesh Y', 'Lakshmi B', 'Priya R'],
          },
          {
            day: 'Sat Mar 22',
            site: 'Apollo Hospital',
            shift: '06:00–14:00',
            candidates: ['Vinod K', 'Mukesh Y'],
          },
          {
            day: 'Sun Mar 23',
            site: 'Apollo Hospital',
            shift: '06:00–14:00',
            candidates: ['Lakshmi B'],
          },
        ],
      },
      money: "₹2,500 deduct from this week's wages",
    },
    {
      id: 'd2',
      tier: 'operational',
      surface: 'light',
      when: '14 min ago',
      title: 'Move Vinod: Apollo → Hitech City',
      body: 'Sarita off; Hitech City is short one. Same shift hours.',
    },
    {
      id: 'd3',
      tier: 'note',
      surface: 'light',
      when: '1 hr ago',
      noteKind: 'site_rule',
      title: 'Site rule recorded: Apollo Hospital',
      body: '"No chemicals near the kitchen." Stored against the site.',
    },
    {
      id: 'd6',
      tier: 'note',
      surface: 'light',
      when: '30 min ago',
      noteKind: 'working_note',
      title: 'Working note: Apollo HR contact',
      body: 'Apollo HR contact is Kavitha — prefers WhatsApp, responds faster than email.',
    },
    {
      id: 'd4',
      tier: 'employment',
      surface: 'heavy',
      when: '1 hr ago',
      title: 'Mukundan — 3rd no-show this week',
      body: "Type 'TERMINATE' to confirm. Final paycheck calculated automatically.",
      money: '₹6,400 owed · final',
    },
    {
      id: 'd5',
      tier: 'ambiguous',
      surface: 'medium',
      trigger: 'AMBIGUOUS WORKER',
      when: '14 sec ago',
      title: 'Which Mukesh?',
      body: 'You said "Mukesh absent today." There are two on your team.',
      options: [
        {
          id: 'mukesh-y',
          name: 'Mukesh Yadav',
          context: 'Westfield Mall · on shift now',
          sub: '··49 · clocked in 06:30',
        },
        {
          id: 'mukesh-s',
          name: 'Mukesh Sharma',
          context: 'Apollo Hospital · off today',
          sub: '··17 · last seen 2 days ago',
        },
      ],
    },
    {
      id: 'd7',
      tier: 'ambiguous',
      surface: 'medium',
      trigger: 'MISSING INFO',
      when: '32 sec ago',
      title: 'Gap larger than candidates',
      body: '3 absences today, 2 available candidates. What do you want to do?',
      options: [
        {
          id: 'skip-site',
          name: 'Reduce service at one site',
          context: 'Westfield Mall is least client-pressure today',
        },
        {
          id: 'pull-from-other',
          name: 'Pull a worker from another site',
          context: 'Apollo has 5/6 — could spare 1 to Westfield',
        },
        {
          id: 'accept-gap',
          name: 'Accept the gap',
          context: 'Document for owner; client may complain',
        },
      ],
    },
  ],

  replacementPicker: {
    forSite: 'Apollo Hospital',
    shift: 'Mar 19, 06:00–14:00',
    filters: [
      {
        id: 'female',
        label: 'Female workers',
        count: 4,
        reason: 'Client preference',
        tier: 'preferred',
      },
      {
        id: 'client_pref',
        label: 'Client favorites',
        count: 2,
        reason: 'Apollo asked for these',
        tier: 'preferred',
      },
      {
        id: 'nearby',
        label: 'Within 30 min',
        count: 5,
        reason: 'Travel time check',
        tier: 'practical',
      },
      {
        id: 'available',
        label: 'Not on shift',
        count: 7,
        reason: 'Avoid double-booking',
        tier: 'practical',
      },
    ],
    candidates: [
      {
        id: 'c1',
        name: 'Lakshmi Bai',
        flags: ['female', 'client_pref', 'nearby', 'available'],
        travel: '12 min',
        currentlyAt: null,
        lastShift: 'Yesterday at Apollo',
      },
      {
        id: 'c2',
        name: 'Priya Reddy',
        flags: ['female', 'nearby', 'available'],
        travel: '18 min',
        currentlyAt: null,
        lastShift: '2 days ago',
      },
      {
        id: 'c3',
        name: 'Mukesh Yadav',
        flags: ['client_pref', 'nearby'],
        travel: '22 min',
        currentlyAt: 'Westfield Mall',
        lastShift: 'Now',
      },
      {
        id: 'c4',
        name: 'Vinod Kumar',
        flags: ['nearby'],
        travel: '32 min',
        currentlyAt: 'Apollo Hospital',
        lastShift: 'Now',
      },
      {
        id: 'c5',
        name: 'Kavita S',
        flags: ['available'],
        travel: '45 min',
        currentlyAt: null,
        lastShift: '3 days ago',
      },
    ],
  },

  pulse: { onSite: 12, late: 2, noShow: 1, flagged: 2, pending: 3 },

  flaggedVisits: [
    {
      id: 'fv1',
      worker: 'Mukundan P',
      site: 'Hitech City',
      when: '06:08',
      reason: 'Photos look incomplete — main lobby missing',
      photoCount: 3,
    },
    {
      id: 'fv2',
      worker: 'Raju Naidu',
      site: 'Westfield Mall',
      when: '07:18',
      reason: 'Late by 13 min, audio note unclear',
      photoCount: 4,
    },
  ],

  workers: [
    {
      id: 'w1',
      name: 'Sarita Devi',
      site: 'Apollo Hospital',
      state: 'on_leave',
      clockIn: null,
      note: 'Half-day · approved',
      shift: 'morning',
    },
    {
      id: 'w2',
      name: 'Vinod Kumar',
      site: 'Apollo Hospital',
      state: 'on_site',
      clockIn: '06:42',
      note: 'Covering Sarita',
      shift: 'morning',
    },
    {
      id: 'w3',
      name: 'Mukundan P',
      site: 'Hitech City',
      state: 'no_show',
      clockIn: null,
      note: '3rd this week',
    },
    { id: 'w4', name: 'Lakshmi Bai', site: 'Hitech City', state: 'on_site', clockIn: '06:55' },
    {
      id: 'w5',
      name: 'Raju Naidu',
      site: 'Westfield Mall',
      state: 'late',
      clockIn: '07:18',
      note: '13 min late',
    },
    { id: 'w6', name: 'Mukesh Yadav', site: 'Westfield Mall', state: 'on_site', clockIn: '06:02' },
    {
      id: 'w7',
      name: 'Priya Reddy',
      site: 'Apollo Hospital',
      state: 'on_site',
      clockIn: '05:58',
      shift: 'morning',
    },
    { id: 'w8', name: 'Arjun Subramani', site: 'Hitech City', state: 'on_site', clockIn: '06:12' },
    { id: 'w9', name: 'Kavita S', site: 'Westfield Mall', state: 'on_site', clockIn: '06:30' },
    {
      id: 'w10',
      name: 'Rohit Sharma',
      site: 'Apollo Hospital',
      state: 'late',
      clockIn: '07:25',
      note: '20 min late',
      shift: 'morning',
    },
    // Change C — evening shift workers at Apollo Hospital
    {
      id: 'w11',
      name: 'Vinod Mishra',
      site: 'Apollo Hospital',
      state: 'on_site',
      clockIn: '14:05',
      shift: 'evening',
    },
    {
      id: 'w12',
      name: 'Lakshmi B',
      site: 'Apollo Hospital',
      state: 'on_site',
      clockIn: '14:30',
      shift: 'evening',
    },
  ],

  sites: [
    {
      id: 's1',
      name: 'Apollo Hospital',
      workersOn: 5,
      workersDue: 6,
      flagged: false,
      rules: ['No chemicals near kitchen', 'Visitors after 9 AM'],
      // Change C — multi-shift site
      shifts: [
        {
          id: 'morning',
          label: 'Morning',
          startTime: '06:00',
          endTime: '14:00',
          supervisor: 'Ravi Kumar',
        },
        {
          id: 'evening',
          label: 'Evening',
          startTime: '14:00',
          endTime: '22:00',
          supervisor: 'Vinod Mishra',
        },
      ],
    },
    {
      id: 's2',
      name: 'Hitech City',
      workersOn: 4,
      workersDue: 5,
      flagged: true,
      rules: ['Quiet zone after 8 PM'],
    },
    { id: 's3', name: 'Westfield Mall', workersOn: 5, workersDue: 5, flagged: false, rules: [] },
  ],

  hrUpdates: [
    // Change D — compliance digest card
    {
      id: 'u0',
      from: 'HR · Anjali',
      when: 'Today, 09:30',
      ackd: false,
      digest: true,
      title: 'Compliance sweep — 5 new rules',
      body: 'Quarterly compliance audit. 5 new rules across PPE, attendance, leave, escalation, and emergency response.',
      rules: [
        {
          id: 'cr1',
          title: 'N95 masks at hospital sites',
          body: 'All workers at hospital sites must wear N95 masks during cleaning shifts.',
        },
        {
          id: 'cr2',
          title: 'Late-arrival reporting threshold',
          body: 'Workers >30 min late must report reason via supervisor; logged automatically.',
        },
        { id: 'cr3', title: 'Diwali leave window', body: 'Oct 28–Nov 3. Submit by Thursday EOD.' },
        {
          id: 'cr4',
          title: 'Emergency escalation contact',
          body: '+91 98765 43210 for accidents, fires, owner-action complaints.',
        },
        {
          id: 'cr5',
          title: 'Salary advance request — new flow',
          body: 'Workers request via supervisor; supervisor approves up to ₹2000.',
        },
      ],
      ackHint: 'Speak or type 5+ words to acknowledge all 5 rules.',
    },
    {
      id: 'u1',
      from: 'HR · Priya',
      when: '08:14',
      ackd: false,
      title: 'New PPE policy starting Monday',
      body: 'All workers at hospital sites must wear N95 masks during cleaning shifts. Stock arrives Saturday at the Surya warehouse — pick up between 4–6 PM.',
      ackHint: 'Speak or type 5+ words to acknowledge.',
    },
    {
      id: 'u2',
      from: 'HR · Priya',
      when: 'Yesterday',
      ackd: false,
      title: 'Diwali leave window — Oct 28–Nov 3',
      body: "Workers requesting Diwali leave should submit by Thursday EOD. We'll plan replacements at the supervisor sync on Friday.",
      ackHint: 'Speak or type 5+ words to acknowledge.',
    },
    {
      id: 'u3',
      from: 'HR · Anjali',
      when: '2 days ago',
      ackd: true,
      title: 'Updated contact for emergency escalation',
      body: 'Emergency line is now +91 98765 43210. Use this only for accidents, fires, or owner complaints requiring same-day action.',
      ackText: 'noted, will use new emergency number for any urgent issue today',
    },
  ],

  summary: {
    changesCount: 7,
    flaggedCount: 1,
    leaveRequestsPending: 2,
    nextDay: { workers: 16, sites: 3, replacements: 1 },
    timeline: [
      { time: '06:08', text: 'Auto-flag: Mukundan no-show at Hitech City' },
      { time: '06:32', text: 'Sent: Mukesh → Hitech City as replacement' },
      { time: '07:14', text: 'Apollo: site rule logged ("no chemicals near kitchen")' },
      { time: '07:48', text: 'Approved: Sarita half-day leave' },
      { time: '08:25', text: 'Reassigned: Vinod → Apollo' },
      { time: '09:02', text: 'Late: Raju (13 min) at Westfield' },
      { time: '09:18', text: 'HR pushed: PPE policy update' },
    ],
  },

  // ---------------------------------------------------------------------------
  // NEW (2026-05-11) — operations-first reframing
  // ---------------------------------------------------------------------------

  /**
   * Decision Workspace queue — persistent SupervisorDecisions that survive sessions.
   * Decisions come FROM (a) AI Chat extractions, (b) HR Updates, (c) worker leave/swap.
   * Each card has lifecycle: PROPOSED → APPLIED | DISMISSED | FAILED | EXPIRED.
   * Tier drives visual styling and ack requirements.
   */
  supervisorDecisions: [
    // Morning batch — supervisor voice-dumped 5 actions at 06:32
    {
      id: 'sd1',
      decisionCardId: 'dc-001',
      tier: 'note',
      kind: 'propose_mark_absent',
      status: 'applied',
      batchId: 'b-morning',
      when: '06:32',
      appliedAt: '06:32',
      title: 'Marked Mukundan P absent',
      worker: 'Mukundan P',
      site: 'Hitech City',
      payload: { workerId: 'w3', reason: 'no-show 3rd this week' },
    },
    {
      id: 'sd2',
      decisionCardId: 'dc-002',
      tier: 'operational',
      kind: 'propose_create_assignment',
      status: 'proposed',
      batchId: 'b-morning',
      when: '06:32',
      title: 'Move Mukesh Yadav → Hitech City',
      worker: 'Mukesh Yadav',
      site: 'Hitech City',
      body: 'Cover for Mukundan. Same shift hours. Westfield runs short until 14:00.',
      payload: { fromSiteId: 's3', toSiteId: 's2', workerId: 'w6' },
    },
    {
      id: 'sd3',
      decisionCardId: 'dc-003',
      tier: 'note',
      kind: 'propose_living_doc_update',
      status: 'proposed',
      batchId: 'b-morning',
      when: '06:32',
      title: 'Remember: Mukundan late on rainy days',
      body: 'Apollo Hospital · workerNotes section · scope: worker Mukundan P (w3)',
      payload: { section: 'workerNotes', ruleText: 'Mukundan tends to be late on rainy days' },
    },
    // REVIEW_REQUIRED — Mukesh Sharma (Apollo) was marked absent at 06:05, just walked in at 09:05
    {
      id: 'sd4',
      decisionCardId: 'dc-004',
      tier: 'review_required',
      kind: 'REVIEW_REQUIRED',
      status: 'proposed',
      when: '09:05',
      title: 'Mukesh Sharma arrived after being marked absent',
      body: 'You marked Mukesh Sharma (Apollo M-17) absent at 06:05 for rain. He just walked in at 09:05.',
      payload: {
        reason: 'worker_arrived_after_absent',
        workerId: 'mukesh-s',
        options: [
          { id: 'keep_absent', label: 'Keep absent (dismiss for the day)' },
          { id: 'reverse_absent', label: 'Mark present + cancel any replacement' },
        ],
      },
    },
    // HR ack required — typed-words discipline
    {
      id: 'sd5',
      decisionCardId: 'dc-005',
      tier: 'personnel',
      kind: 'hr_ack_required',
      status: 'proposed',
      when: '08:14',
      title: 'PPE policy starting Monday — ack required',
      body: 'HR · Priya: All workers at hospital sites must wear N95 masks. Stock arrives Sat 4–6 PM at Surya warehouse.',
      payload: { hrUpdateId: 'u1', acknowledgmentPhrase: 'I understand' },
      ackRequired: true,
    },
    // Operational — already failed (overlap conflict)
    {
      id: 'sd6',
      decisionCardId: 'dc-006',
      tier: 'operational',
      kind: 'propose_create_assignment',
      status: 'failed',
      batchId: 'b-morning',
      when: '06:32',
      failedAt: '06:32',
      title: 'Move Lakshmi Bai → Apollo Hospital',
      body: 'FAILED · OVERLAP_CONFLICT: Lakshmi is already assigned to Hitech City this shift.',
      worker: 'Lakshmi Bai',
      site: 'Apollo Hospital',
      failureReason: 'OVERLAP_CONFLICT',
      payload: { workerId: 'w4', toSiteId: 's1' },
    },
    // Pending leave decision
    {
      id: 'sd7',
      decisionCardId: 'dc-007',
      tier: 'personnel',
      kind: 'propose_leave',
      status: 'proposed',
      when: '2 min ago',
      title: "Approve Sarita's 5-day leave?",
      body: 'Family wedding, Mar 19–23. Apollo Hospital site needs daily cover.',
      worker: 'Sarita Devi',
      site: 'Apollo Hospital',
      payload: { workerId: 'w1', fromDate: 'Mar 19', toDate: 'Mar 23' },
    },
    // EMPLOYMENT-tier — typed-words ack required (auto-set from tier in DecisionRow)
    {
      id: 'sd8',
      decisionCardId: 'dc-008',
      tier: 'employment',
      kind: 'propose_termination',
      status: 'proposed',
      when: '14 min ago',
      title: 'Terminate Mukundan P — 3rd no-show this week',
      body: '3 unauthorized absences in 7 days. Final paycheck calculated automatically. ₹6,400 owed.',
      worker: 'Mukundan P',
      site: 'Hitech City',
      payload: { workerId: 'w3', acknowledgmentPhrase: 'TERMINATE' },
    },
  ],

  /**
   * Activity / Proof timeline — AuditEvent rows from today + past 7 days.
   * Filterable by date / worker / site / kind. Each row has structured payload
   * fields (workerId, siteId) used by the filter logic.
   * 30-min reverse window enforced in UI based on `createdAt`.
   */
  activityEvents: [
    // Today
    {
      id: 'ae1',
      kind: 'WORKER_MARKED_ABSENT',
      date: 'Today',
      time: '06:05',
      workerId: 'mukesh-s',
      workerName: 'Mukesh Sharma',
      siteId: 's1',
      siteName: 'Apollo Hospital',
      actorName: 'You',
      reason: 'rain',
      decisionCardId: 'dc-bulk-rain-1',
      reversible: false, // > 30 min ago at 09:41
    },
    {
      id: 'ae2',
      kind: 'DECISION_PROPOSED',
      date: 'Today',
      time: '06:32',
      workerId: 'w6',
      workerName: 'Mukesh Yadav',
      siteId: 's2',
      siteName: 'Hitech City',
      actorName: 'You',
      batchId: 'b-morning',
      reversible: false,
    },
    {
      id: 'ae3',
      kind: 'WORKER_MARKED_ABSENT',
      date: 'Today',
      time: '06:08',
      workerId: 'w3',
      workerName: 'Mukundan P',
      siteId: 's2',
      siteName: 'Hitech City',
      actorName: 'You',
      reason: 'no-show 3rd this week',
      reversible: false,
    },
    {
      id: 'ae4',
      kind: 'WORKER_MARKED_LATE',
      date: 'Today',
      time: '07:18',
      workerId: 'w5',
      workerName: 'Raju Naidu',
      siteId: 's3',
      siteName: 'Westfield Mall',
      actorName: 'You',
      reason: 'traffic',
      reversible: false,
    },
    {
      id: 'ae5',
      kind: 'LIVING_DOC_RULE_ADDED',
      date: 'Today',
      time: '07:14',
      siteId: 's1',
      siteName: 'Apollo Hospital',
      actorName: 'You',
      payloadText: 'Rule: "No chemicals near kitchen"',
      reversible: false,
    },
    {
      id: 'ae6',
      kind: 'WORKER_MARKED_PRESENT',
      date: 'Today',
      time: '09:35',
      workerId: 'w2',
      workerName: 'Vinod Kumar',
      siteId: 's1',
      siteName: 'Apollo Hospital',
      actorName: 'You',
      reason: 'walk-in',
      reversible: true, // within 30 min
    },
    // Yesterday
    {
      id: 'ae7',
      kind: 'LEAVE_APPROVED',
      date: 'Yesterday',
      time: '17:48',
      workerId: 'w1',
      workerName: 'Sarita Devi',
      siteId: 's1',
      siteName: 'Apollo Hospital',
      actorName: 'You',
      reason: 'half-day medical',
      reversible: false,
    },
    {
      id: 'ae8',
      kind: 'SWAP_APPLIED',
      date: 'Yesterday',
      time: '14:25',
      workerId: 'w2',
      workerName: 'Vinod Kumar',
      siteId: 's1',
      siteName: 'Apollo Hospital',
      actorName: 'You',
      reason: 'from Hitech City',
      reversible: false,
    },
    // Past week (compressed for activity stress)
    ...Array.from({ length: 22 }, (_, i) => {
      const daysBack = 2 + Math.floor(i / 4);
      const workers = [
        { id: 'w1', name: 'Sarita Devi', site: 'Apollo Hospital', siteId: 's1' },
        { id: 'w2', name: 'Vinod Kumar', site: 'Apollo Hospital', siteId: 's1' },
        { id: 'w3', name: 'Mukundan P', site: 'Hitech City', siteId: 's2' },
        { id: 'w4', name: 'Lakshmi Bai', site: 'Hitech City', siteId: 's2' },
        { id: 'w5', name: 'Raju Naidu', site: 'Westfield Mall', siteId: 's3' },
        { id: 'w6', name: 'Mukesh Yadav', site: 'Westfield Mall', siteId: 's3' },
      ];
      const w = workers[i % workers.length];
      const kinds = [
        'WORKER_MARKED_PRESENT',
        'WORKER_MARKED_LATE',
        'WORKER_MARKED_ABSENT',
        'VISIT_COMPLETED',
      ];
      return {
        id: `ae_w${i}`,
        kind: kinds[i % kinds.length],
        date: `${daysBack} days ago`,
        time: `${String(6 + (i % 12)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
        workerId: w.id,
        workerName: w.name,
        siteId: w.siteId,
        siteName: w.site,
        actorName: 'You',
        reversible: false,
      };
    }),
  ],

  /**
   * Temporary mode — per-Membership scope. Toggle in Profile.
   * When `until` is in the future, banner shows on every screen + AuditEvent
   * payload.temporaryModeWasActive flag is stamped on all writes.
   */
  tempMode: {
    active: false,
    until: null, // ISO date when temp mode auto-ends
    startedAt: null,
    reason: null, // free text
    standInName: null, // human-readable who is operating
  },

  /**
   * Weak-network simulation flag — toggle in Profile or via dev menu.
   * When true:
   * - banner: "Last synced 45 min ago"
   * - reverse buttons disabled
   * - share to WhatsApp shows extra warning
   * - AI Chat input disabled below threshold
   */
  weakNetwork: {
    active: false,
    lastSyncedMinutesAgo: 45,
  },

  /**
   * Rainy-day mode flag — surfaces a banner at top of Today Monitor with
   * quick actions (multi-select bulk-absent, auto-suggest replacements, share to WhatsApp).
   */
  rainyDayMode: true,
};

/* global React */
// Stroke-based icon set, sized via `size` prop. Designed against 24px viewbox, 1.75 stroke.

const I = (() => {
  const make =
    (paths, fills) =>
    ({ size = 22, color = 'currentColor', strokeWidth = 1.75, ...rest } = {}) => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {paths}
        {fills}
      </svg>
    );

  return {
    Mic: make(
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </>,
    ),
    MicSolid: ({ size = 28, color = 'currentColor' }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path
          d="M5 11a7 7 0 0 0 14 0"
          stroke={color}
          strokeWidth="1.75"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M12 18v3" stroke={color} strokeWidth="1.75" fill="none" strokeLinecap="round" />
      </svg>
    ),
    MessageSquare: make(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
    Calendar: make(
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>,
    ),
    BarChart: make(
      <>
        <path d="M3 21h18" />
        <path d="M6 17V11" />
        <path d="M11 17V7" />
        <path d="M16 17v-4" />
      </>,
    ),
    Bell: make(
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>,
    ),
    User: make(
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>,
    ),
    ChevronRight: make(<path d="M9 18l6-6-6-6" />),
    ChevronLeft: make(<path d="M15 18l-6-6 6-6" />),
    ChevronDown: make(<path d="M6 9l6 6 6-6" />),
    Edit: make(
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
      </>,
    ),
    Logout: make(
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </>,
    ),
    Building: make(
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
      </>,
    ),
    Globe: make(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
      </>,
    ),
    Phone: make(
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
    ),
    Camera: make(
      <>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </>,
    ),
    Users: make(
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>,
    ),
    MapPin: make(
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </>,
    ),
    Coins: make(
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
        <path d="M7 6h1v4M16.71 13.88l.71.71-2.83 2.83" />
      </>,
    ),
    Check: make(<path d="M5 12l5 5L20 7" />),
    X: make(
      <>
        <path d="M18 6L6 18" />
        <path d="M6 6l12 12" />
      </>,
    ),
    Plus: make(
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>,
    ),
    Star: make(
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
    ),
    UserPlus: make(
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M20 8v6M23 11h-6" />
      </>,
    ),
    AlertTriangle: make(
      <>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4M12 17h.01" />
      </>,
    ),
    AlertCircle: make(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </>,
    ),
    Clock: make(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </>,
    ),
    Pause: make(
      <>
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </>,
    ),
    Search: make(
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </>,
    ),
    RefreshCw: make(
      <>
        <path d="M23 4v6h-6" />
        <path d="M1 20v-6h6" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </>,
    ),
    Sparkle: make(
      <>
        <path d="M12 2v6" />
        <path d="M12 16v6" />
        <path d="M2 12h6" />
        <path d="M16 12h6" />
        <path d="M5 5l3 3" />
        <path d="M16 16l3 3" />
        <path d="M19 5l-3 3" />
        <path d="M8 16l-3 3" />
      </>,
    ),
    Send: make(
      <>
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
      </>,
    ),
    Volume: make(
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
      </>,
    ),
    Battery: make(
      <>
        <rect x="2" y="7" width="18" height="10" rx="2" />
        <line x1="22" y1="11" x2="22" y2="13" />
      </>,
    ),
    Wifi: make(
      <>
        <path d="M5 13a10 10 0 0 1 14 0" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M2 8.82a15 15 0 0 1 20 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </>,
    ),
    SignalDot: () => (
      <span style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end' }}>
        <span style={{ width: 3, height: 4, background: 'currentColor', borderRadius: 1 }} />
        <span style={{ width: 3, height: 6, background: 'currentColor', borderRadius: 1 }} />
        <span style={{ width: 3, height: 8, background: 'currentColor', borderRadius: 1 }} />
        <span style={{ width: 3, height: 10, background: 'currentColor', borderRadius: 1 }} />
      </span>
    ),
    MoreVertical: make(
      <>
        <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
      </>,
    ),
    MoonStar: make(
      <>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9" />
        <path d="M20 3v4M22 5h-4" />
      </>,
    ),
    HelpCircle: make(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>,
    ),
    ChevronUp: make(<path d="M18 15l-6-6-6 6" />),
    // r3 — hamburger menu for TopAppBar drawer toggle.
    Menu: make(
      <>
        <path d="M3 6h18M3 12h18M3 18h18" />
      </>,
    ),
  };
})();

window.I = I;

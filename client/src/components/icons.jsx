// Minimal hand-rolled outline icons (24x24, 1.75 stroke) so the app has no
// external icon-library dependency.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
};

export function PhoneIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4.5h3.2l1.3 4-2 1.5a11.5 11.5 0 0 0 5.5 5.5l1.5-2 4 1.3V18a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5Z" />
    </svg>
  );
}

export function MailIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7 12 12.5 19.5 7" />
    </svg>
  );
}

export function MenuIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6.5h16" />
      <path d="M4 12h16" />
      <path d="M4 17.5h16" />
    </svg>
  );
}

export function GridIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function UsersIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.75 20c0-3.45 2.8-6 6.25-6s6.25 2.55 6.25 6" />
      <path d="M15.5 5.2c1.4.4 2.4 1.7 2.4 3.2 0 1.5-1 2.8-2.4 3.2" />
      <path d="M17.5 14.3c2.4.6 4 2.6 4 5.2" />
    </svg>
  );
}

export function ContactIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9.5" cy="10.5" r="2.25" />
      <path d="M6 16.2c.5-1.9 2-3 3.5-3s3 1.1 3.5 3" />
      <path d="M14.5 9h3.5" />
      <path d="M14.5 12.5h3.5" />
    </svg>
  );
}

export function ClockIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function SyncIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 8 0 0 1 13.5-5.8L20 8.5" />
      <path d="M20 4.5v4h-4" />
      <path d="M20 12a8 8 0 0 1-13.5 5.8L4 15.5" />
      <path d="M4 19.5v-4h4" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M15 4.5h2.5a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H15" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6.5 12H19" />
    </svg>
  );
}

export function LockIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function TrendingUpIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 16.5 10 10l4 4 6.5-6.5" />
      <path d="M15 7.5h5.5V13" />
    </svg>
  );
}

export function AlertIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </svg>
  );
}

export function CheckCircleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M8.5 12.5 11 15l4.5-6" />
    </svg>
  );
}

export function XCircleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </svg>
  );
}

export function UploadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 15.5V4.5" />
      <path d="M7.5 9 12 4.5 16.5 9" />
      <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function DownloadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5v11" />
      <path d="M7.5 11 12 15.5 16.5 11" />
      <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

import { MailIcon } from './icons.jsx';

// mailto: link so tapping an email address opens the device's mail app,
// same as PhoneLink does for tap-to-call.
export function EmailLink({ email }) {
  if (!email) return '—';
  return (
    <a
      href={`mailto:${email}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 text-slate-700 transition hover:text-brand-600"
      title={`Email ${email}`}
    >
      <MailIcon className="h-3.5 w-3.5 text-brand-500" />
      {email}
    </a>
  );
}

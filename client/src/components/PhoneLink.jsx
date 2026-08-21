import { PhoneIcon } from './icons.jsx';

// Indian mobile numbers are 10 digits; imported leads commonly carry a
// 2-digit "91" country-code prefix (12 digits total), which isn't needed to
// dial locally. Strip a 2-digit prefix whenever the number is longer than
// 10 digits so what's shown and dialed is the plain 10-digit number.
function normalizeMobile(number) {
  const digits = number.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(2) : digits;
}

// tel: link so tapping a phone number opens the device's dialer.
export function PhoneLink({ number }) {
  if (!number) return '—';
  const clean = normalizeMobile(number);
  return (
    <a
      href={`tel:${clean}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 text-slate-700 transition hover:text-brand-600"
      title={`Call ${clean}`}
    >
      <PhoneIcon className="h-3.5 w-3.5 text-brand-500" />
      {clean}
    </a>
  );
}

// Simple inline mark (a funnel, standing in for "leads flowing into the
// pipeline") plus the product name -- no external asset, so it scales
// cleanly at any size.
const TEXT_SIZE = {
  lg: 'text-2xl',
  md: 'text-xl',
  sm: 'text-base',
};

const ICON_SIZE = {
  lg: 32,
  md: 26,
  sm: 20,
};

export function Wordmark({ size = 'md', className = '' }) {
  return (
    <div className={`mx-auto flex items-center justify-center gap-2 ${className}`}>
      <svg
        width={ICON_SIZE[size]}
        height={ICON_SIZE[size]}
        viewBox="0 0 24 24"
        fill="none"
        className="shrink-0 text-brand-600"
      >
        <path
          d="M3.5 4.5h17L14 12.5v6l-4 2v-8L3.5 4.5Z"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`font-semibold tracking-tight text-slate-900 ${TEXT_SIZE[size]}`}>
        Lead<span className="text-brand-600">Flow</span>
      </span>
    </div>
  );
}

import { useState } from 'react';
import { CheckCircleIcon, XCircleIcon } from './icons.jsx';

const ROW_HEIGHT = 34;

const TONES = {
  slate: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
  brand: { icon: 'bg-brand-50 text-brand-600', value: 'text-slate-900' },
  amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700' },
  red: { icon: 'bg-red-50 text-red-600', value: 'text-red-700' },
  green: { icon: 'bg-green-50 text-green-600', value: 'text-green-700' },
};

// Shared by both the admin and employee dashboards: a single headline
// number with an icon, e.g. "Total Leads: 42".
export function StatCard({ label, value, tone = 'slate', icon: Icon }) {
  const t = TONES[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${t.value}`}>{value}</div>
        </div>
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.icon}`}>
            <Icon className="h-[1.1rem] w-[1.1rem]" />
          </div>
        )}
      </div>
    </div>
  );
}

// Shared card shell wrapping a chart/list with a title and optional subtitle.
export function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// Fixed categorical order/hues for lead status, reused everywhere a status
// breakdown is drawn (never cycled, never repainted when a filter changes
// which statuses are present) -- same hue family as the status badges
// elsewhere in the app (Won green, Lost red, Not answered slate, Contacted
// blue, Broker purple), stepped up from their pastel-50 badge tint to a
// solid 500/600 shade since a thin donut ring needs real contrast against
// white, not a tint.
export const STATUS_CHART_ORDER = ['Won', 'Lost', 'Not answered', 'Contacted', 'Broker'];
export const STATUS_CHART_COLORS = {
  Won: '#16a34a',
  Lost: '#dc2626',
  'Not answered': '#94a3b8',
  Contacted: '#2563eb',
  Broker: '#9333ea',
};

// "2h ago" / "3d ago" style relative time for a "recently assigned" feed,
// where the exact timestamp matters far less than roughly how fresh it is.
function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Feed of the most recently assigned leads (see GET /dashboard/recent-
// assignments and /dashboard/mine) -- who got what, and when, rather than
// just the current headcount-per-employee a bar chart shows. `showEmployee`
// is off on an employee's own dashboard, where every row is implicitly
// "assigned to me".
export function RecentAssignmentsList({ items, showEmployee = true, emptyLabel = 'No assignments yet' }) {
  if (items.length === 0) {
    return <div className="text-sm text-slate-400">{emptyLabel}</div>;
  }
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={`${item.lead_id}-${item.created_at}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: STATUS_CHART_COLORS[item.lead_status] || '#94a3b8' }}
            title={item.lead_status}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{item.lead_name}</div>
            <div className="truncate text-xs text-slate-400">
              {item.lead_city || '—'}
              {showEmployee && item.employee_name ? ` · assigned to ${item.employee_name}` : ''}
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">{timeAgo(item.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

// Donut chart for a categorical status/priority breakdown -- color carries
// identity (fixed hue per label, never rank), with a legend as the primary
// label (values are never color-alone) since a 5-way donut has no room for
// direct slice labels. A thin gap between adjacent segments keeps them
// visually distinct even for readers who can't separate the hues.
export function DonutChart({ items, labelKey, valueKey = 'count', colorMap, size = 152, strokeWidth = 24, emptyLabel = 'No data' }) {
  const nonZero = items.filter((i) => i[valueKey] > 0);
  const total = nonZero.reduce((sum, i) => sum + i[valueKey], 0);

  if (total === 0) {
    return <div className="text-sm text-slate-400">{emptyLabel}</div>;
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 3;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        {nonZero.map((item) => {
          const value = item[valueKey];
          const dash = (value / total) * circumference;
          const dashOffset = -offset;
          offset += dash;
          return (
            <circle
              key={item[labelKey] ?? 'unset'}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colorMap[item[labelKey]] || '#94a3b8'}
              strokeWidth={strokeWidth}
              strokeDasharray={`${Math.max(dash - gap, 0)} ${circumference - Math.max(dash - gap, 0)}`}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dasharray] duration-300 ease-out"
            />
          );
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {nonZero.map((item) => {
          const value = item[valueKey];
          const pct = Math.round((value / total) * 100);
          return (
            <div key={item[labelKey]} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorMap[item[labelKey]] || '#94a3b8' }}
              />
              <span className="min-w-0 flex-1 truncate text-slate-600">{item[labelKey] || 'Not set'}</span>
              <span className="shrink-0 tabular-nums font-semibold text-slate-900">{value}</span>
              <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Horizontal bar list -- the "compare magnitude across categories" job, so a
// single hue (brand) carries all bars per the sequential-color rule. Every
// value is a direct label (not hidden behind hover), and a lightweight
// tooltip supplements it on hover/focus.
export function BarList({ items, labelKey, valueKey = 'count', emptyLabel = 'Unassigned' }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const max = Math.max(1, ...items.map((i) => i[valueKey]));

  if (items.length === 0) {
    return <div className="text-sm text-slate-400">No data</div>;
  }

  return (
    <div className="relative">
      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute right-0 z-10 -translate-y-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{ top: hoverIndex * ROW_HEIGHT + ROW_HEIGHT / 2 }}
        >
          {items[hoverIndex][labelKey] || emptyLabel}: <span className="font-semibold">{items[hoverIndex][valueKey]}</span>
        </div>
      )}
      <div>
        {items.map((item, idx) => {
          const pct = (item[valueKey] / max) * 100;
          return (
            <div
              key={item[labelKey] ?? idx}
              className="flex items-center gap-3 rounded-lg px-1.5 transition hover:bg-slate-50"
              style={{ height: ROW_HEIGHT }}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(idx)}
              onBlur={() => setHoverIndex(null)}
              tabIndex={0}
            >
              <span className="w-28 shrink-0 truncate text-sm text-slate-600">{item[labelKey] || emptyLabel}</span>
              <span className="h-2.5 flex-1 rounded-full bg-slate-100">
                <span
                  className="block h-2.5 rounded-r bg-brand-500 transition-[width,filter] duration-300 ease-out"
                  style={{
                    width: `${pct}%`,
                    filter: hoverIndex === idx ? 'brightness(1.12)' : undefined,
                  }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                {item[valueKey]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Two-segment split bar for a polarity/outcome pair (Won vs Lost). Red/green
// alone fails CVD separation for the ~8% of colorblind readers, so identity
// never rides on hue alone here: each segment ships with an icon + text
// label, per the reserved-status-color mitigation.
export function SplitBar({ won, lost }) {
  const total = won + lost;

  if (total === 0) {
    return <div className="text-sm text-slate-400">No won or lost leads yet</div>;
  }

  const wonPct = Math.round((won / total) * 100);
  const lostPct = 100 - wonPct;

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {won > 0 && (
          <div
            className="h-full bg-green-500 transition-[width] duration-300 ease-out"
            style={{ width: `${wonPct}%`, marginRight: lost > 0 ? 2 : 0 }}
          />
        )}
        {lost > 0 && <div className="h-full flex-1 bg-red-500 transition-[width] duration-300 ease-out" />}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-green-700">
          <CheckCircleIcon className="h-4 w-4" />
          Won <span className="tabular-nums text-slate-500">({won} · {wonPct}%)</span>
        </span>
        <span className="flex items-center gap-1.5 font-medium text-red-700">
          Lost <span className="tabular-nums text-slate-500">({lost} · {lostPct}%)</span>
          <XCircleIcon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

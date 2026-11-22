import { useState } from 'react';
import { ContactIcon } from './icons.jsx';
import { PhoneLink } from './PhoneLink.jsx';
import { EmailLink } from './EmailLink.jsx';
import { Link } from 'react-router-dom';
const STATUS_OPTIONS = ['Won', 'Lost', 'Not answered', 'Contacted', 'Broker'];
const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'P5'];

const STATUS_COLORS = {
  Won: 'bg-green-50 text-green-700',
  Lost: 'bg-red-50 text-red-700',
  'Not answered': 'bg-slate-100 text-slate-600',
  Contacted: 'bg-blue-50 text-blue-700',
  Broker: 'bg-purple-50 text-purple-700',
};

const PRIORITY_COLORS = {
  P1: 'bg-red-50 text-red-700',
  P2: 'bg-amber-50 text-amber-700',
  P3: 'bg-slate-100 text-slate-600',
  P5: 'bg-indigo-50 text-indigo-700',
};

const cellFieldClass =
  'w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/15';

// Live "days until/since" for Next Follow-Up -- computed on the fly (today
// minus the date) rather than stored, since it changes every day on its own.
function followUpDaysRemaining(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Every date is stored as ISO (YYYY-MM-DD) but shown with the month spelled
// out (e.g. "05-Aug-2026") -- storage stays sortable/unambiguous while
// display can never be misread as MM/DD vs DD/MM the way a bare numeric
// format could be.
function formatDMY(dateStr, separator) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const [, year, month, day] = m;
  const abbr = MONTH_ABBR[Number(month) - 1];
  if (!abbr) return dateStr;
  return `${day}${separator}${abbr}${separator}${year}`;
}

function formatLeadDate(dateStr) {
  return formatDMY(dateStr, '/') || '—';
}

function FollowUpCountdown({ dateStr }) {
  const days = followUpDaysRemaining(dateStr);
  if (days === null) return <span className="text-slate-400">—</span>;
  if (days < 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
        {Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} overdue
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        Today
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
      in {days} day{days === 1 ? '' : 's'}
    </span>
  );
}

function Badge({ value, colorMap }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${colorMap[value] || 'bg-slate-100 text-slate-700'}`}>
      {value || '—'}
    </span>
  );
}

// `w-full` alone leaves the column sized off the header text, not the
// options -- a percentage width doesn't feed into the table's automatic
// column-width calculation the way an explicit min-width does, so a select
// with `w-full` and no min-width shrinks to whatever's narrower and clips
// its own selected text (this bit Notes/TextCell the same way; same fix).
function SelectCell({ value, options, onChange, minWidthClass = 'min-w-[6rem]' }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={`${minWidthClass} ${cellFieldClass}`}>
      <option value="" disabled>
        Select…
      </option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// A native <input type="date"> always renders in the browser's own locale
// format (MM/DD/YYYY for most of this team), and an empty one shows the
// browser's "today" ghost hint in its segments -- both read as ambiguous or
// outright wrong at a glance. The input itself stays invisible except while
// focused (it still opens the native picker and accepts typing), with an
// unambiguous "05-Aug-2026" (or "Not set") label layered behind it for the
// resting/read state, which our own formatting controls instead of the
// browser's locale.
function DateCell({ value, onChange }) {
  const label = formatDMY(value, '-');
  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute inset-0 flex items-center truncate px-2 text-sm ${
          label ? 'text-slate-700' : 'text-slate-400'
        }`}
      >
        {label || 'Not set'}
      </span>
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`${cellFieldClass} opacity-0 focus:opacity-100`}
      />
    </div>
  );
}

// A single-line <input> forces a long note behind horizontal scroll inside
// the field itself -- easy to lose track of where you are in it. A
// <textarea> wraps naturally and grows a couple of lines tall by default
// (drag the corner for more), so the note is readable at a glance instead
// of scrolled through.
function TextCell({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState(value || '');
  return (
    <textarea
      value={draft}
      placeholder={placeholder}
      rows={2}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (value || '')) onChange(draft);
      }}
      className={`min-w-[14rem] max-w-[24rem] resize-y ${cellFieldClass}`}
    />
  );
}

// Plain free text -- this comes from the spreadsheet import for virtually
// every lead, so no suggestion dropdown here; it'd almost never be used and
// just adds a popup in the way of a field that's already filled in.
function InterestedInCell({ value, onChange }) {
  const [draft, setDraft] = useState(value || '');
  return (
    <input
      value={draft}
      placeholder="Not specified"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (value || '')) onChange(draft);
      }}
      className={`min-w-[10rem] ${cellFieldClass}`}
    />
  );
}

const th = 'px-3.5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
const td = 'px-3.5 py-2.5';

// Shared table used by both the admin Leads view and the employee My Leads /
// Follow-ups Due views. `editable` controls which columns render as inputs
// vs. plain text; `onUpdate(leadId, patch)` is called on every field change.
// `onReject(leadId)` (employee views only) gives up a lead back to
// unassigned so the admin can hand it to someone else.
export default function LeadsTable({
  leads,
  editable,
  showAssigned,
  showKey = true,
  employees,
  onUpdate,
  onReject,
  selectable,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <ContactIcon className="h-5 w-5" />
        </div>
        <div className="text-sm font-medium text-slate-600">No leads found</div>
        <div className="text-xs text-slate-400">Leads will appear here once added or assigned.</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-soft">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/80">
          <tr>
            {selectable && (
              <th className={th}>
                <input
                  type="checkbox"
                  checked={leads.length > 0 && leads.every((l) => selectedIds.has(l.id))}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                  title="Select all"
                />
              </th>
            )}
            {showKey && <th className={th}>Key</th>}
            <th className={th}>Name</th>
            <th className={th}>Mobile</th>
            <th className={th}>Email</th>
            <th className={th}>City</th>
            <th className={th}>Date</th>
            <th className={th}>Source</th>
            {showAssigned && <th className={th}>Assigned</th>}
            {showAssigned && <th className={th}>Previously Assigned</th>}
            <th className={th}>Interested In</th>
            <th className={th}>Status</th>
            <th className={th}>Priority</th>
            <th className={th}>Notes</th>
            <th className={th}>Last Contacted</th>
            <th className={th}>Next Follow-Up</th>
            <th className={th}>Follow-Up In</th>
            {onReject && <th className={th}></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="transition hover:bg-slate-50/70">
              {selectable && (
                <td className={td}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={() => onToggleSelect(lead.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                  />
                </td>
              )}
              {showKey && (
                <td className={`${td} whitespace-nowrap font-mono text-xs text-slate-500`} title="Same key = same person (FirstName-City-last2digits), even from a different lead form">
                  {lead.unique_key}
                </td>
              )}
              <td className={`${td} whitespace-nowrap font-medium text-slate-800`}>
  <Link
    to={`/leads/${lead.id}`}
    className="text-slate-800 transition hover:text-indigo-600 hover:underline"
  >
    {lead.name || 'Unnamed lead'}
  </Link>

  {lead.recur_count > 1 && (
    <span
      className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-700"
      title={`This person has submitted a lead form ${lead.recur_count} times`}
    >
      ↻{lead.recur_count}
    </span>
  )}
</td>
              <td className={`${td} whitespace-nowrap text-slate-600`}>
                <PhoneLink number={lead.mob} />
              </td>
              <td className={`${td} whitespace-nowrap text-slate-600`}>
                <EmailLink email={lead.email} />
              </td>
              <td className={`${td} whitespace-nowrap text-slate-600`}>{lead.city}</td>
              <td className={`${td} whitespace-nowrap text-slate-600`}>{formatLeadDate(lead.date)}</td>
              <td className={`${td} max-w-[12rem] truncate text-slate-500`} title={lead.lead_source || ''}>
                {lead.lead_source || '—'}
              </td>
              {showAssigned && (
                <td className={`${td} whitespace-nowrap`}>
                  {editable === 'admin' ? (
                    <select
                      value={lead.assigned_user_id || ''}
                      onChange={(e) => onUpdate(lead.id, { assigned_user_id: e.target.value ? Number(e.target.value) : null })}
                      className={`min-w-[9rem] ${cellFieldClass}`}
                    >
                      <option value="">Unassigned</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    lead.assigned_name || '—'
                  )}
                </td>
              )}
              {showAssigned && (
                <td className={`${td} whitespace-nowrap text-slate-500`}>{lead.previous_assigned_name || '—'}</td>
              )}
              <td className={`${td} whitespace-nowrap`}>
                {editable === 'admin' ? (
                  <InterestedInCell value={lead.interested_in} onChange={(v) => onUpdate(lead.id, { interested_in: v })} />
                ) : (
                  <span className="text-slate-600">{lead.interested_in || '—'}</span>
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {editable ? (
                  <SelectCell
                    value={lead.status}
                    options={STATUS_OPTIONS}
                    onChange={(v) => onUpdate(lead.id, { status: v })}
                    minWidthClass="min-w-[9rem]"
                  />
                ) : (
                  <Badge value={lead.status} colorMap={STATUS_COLORS} />
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {editable ? (
                  <SelectCell value={lead.priority} options={PRIORITY_OPTIONS} onChange={(v) => onUpdate(lead.id, { priority: v })} />
                ) : (
                  <Badge value={lead.priority} colorMap={PRIORITY_COLORS} />
                )}
              </td>
              <td className={td}>
                {editable ? (
                  <TextCell value={lead.notes} placeholder="Add note…" onChange={(v) => onUpdate(lead.id, { notes: v })} />
                ) : (
                  <span className="text-slate-600">{lead.notes || '—'}</span>
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {editable ? (
                  <DateCell value={lead.last_contacted} onChange={(v) => onUpdate(lead.id, { last_contacted: v })} />
                ) : (
                  formatDMY(lead.last_contacted, '-') || '—'
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {editable ? (
                  <DateCell value={lead.next_follow_up} onChange={(v) => onUpdate(lead.id, { next_follow_up: v })} />
                ) : (
                  formatDMY(lead.next_follow_up, '-') || '—'
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                <FollowUpCountdown dateStr={lead.next_follow_up} />
              </td>
              {onReject && (
                <td className={`${td} whitespace-nowrap`}>
                  <button
                    onClick={() => {
                      if (window.confirm(`Reject ${lead.name}? It will go back to unassigned for the admin to reassign.`)) {
                        onReject(lead.id);
                      }
                    }}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Reject
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

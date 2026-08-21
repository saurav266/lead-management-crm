import { useState } from 'react';
import { XCircleIcon } from './icons.jsx';

// Keys/order must match EXPORT_COLUMNS in server/src/routes/leads.routes.js.
const EXPORT_COLUMNS = [
  { key: 'key', label: 'Key' },
  { key: 'name', label: 'Name' },
  { key: 'mob', label: 'Mobile' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'City' },
  { key: 'date', label: 'Date' },
  { key: 'platform', label: 'Platform' },
  { key: 'campaign_name', label: 'Campaign' },
  { key: 'adset_name', label: 'Ad Set' },
  { key: 'ad_name', label: 'Ad Name' },
  { key: 'interested_in', label: 'Interested In' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'notes', label: 'Notes' },
  { key: 'last_contacted', label: 'Last Contacted' },
  { key: 'next_follow_up', label: 'Next Follow-Up' },
  { key: 'previously_assigned', label: 'Previously Assigned' },
  { key: 'recur_count', label: 'Recurring Count' },
  { key: 'source', label: 'Source' },
  { key: 'created_at', label: 'Created At' },
  { key: 'updated_at', label: 'Updated At' },
];

// Lets the admin pick exactly which columns end up in the exported file,
// and optionally force it to just rejected (pending-reassignment) leads
// regardless of whatever the Leads page's own filter bar currently has
// set. `buildFilterParams` is the same query-building function the page
// already uses for the live table, so "Export" here respects the current
// Status/Priority/City/Search/etc. filters unless "Rejected leads only"
// overrides the assignment one specifically.
export function ExportLeadsModal({ onClose, buildFilterParams }) {
  const [selected, setSelected] = useState(() => new Set(EXPORT_COLUMNS.map((c) => c.key)));
  const [rejectedOnly, setRejectedOnly] = useState(false);

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === EXPORT_COLUMNS.length ? new Set() : new Set(EXPORT_COLUMNS.map((c) => c.key))));
  }

  function handleExport() {
    const params = buildFilterParams();
    if (rejectedOnly) params.set('assigned', 'rejected'); // overrides whatever the page's Employee filter has
    if (selected.size > 0 && selected.size < EXPORT_COLUMNS.length) {
      params.set('columns', [...selected].join(','));
    } else {
      params.delete('columns'); // none or all selected -- same as omitting it, exports every column
    }
    window.location.href = `/api/leads/export?${params.toString()}`;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Export leads</h2>
          <button onClick={onClose} className="text-slate-400 transition hover:text-slate-600" aria-label="Close">
            <XCircleIcon className="h-6 w-6" />
          </button>
        </div>

        <label
          className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700"
          title="Overrides the Employee filter above and exports only leads pending reassignment, regardless of what's currently applied on the page"
        >
          <input
            type="checkbox"
            checked={rejectedOnly}
            onChange={(e) => setRejectedOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
          />
          Rejected leads only (pending reassignment)
        </label>

        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700">Columns to include</div>
          <button type="button" onClick={toggleAll} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            {selected.size === EXPORT_COLUMNS.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
          {EXPORT_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={selected.has(col.key)}
                onChange={() => toggle(col.key)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
              />
              {col.label}
            </label>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={selected.size === 0}
            className="flex-1 rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-50"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

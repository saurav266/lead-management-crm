const PAGE_SIZE_OPTIONS = [10, 50, 100, 500];

const fieldClass =
  'rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

const buttonClass =
  'rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

// Shared by the admin Leads page and employee My Leads -- both list leads
// through the same paginated GET /leads endpoint, so the control (and its
// behavior) is identical for both.
export function Pagination({ page, pageCount, pageSize, total, onPageChange, onPageSizeChange }) {
  if (total === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <label className="flex items-center gap-2">
        Show
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className={fieldClass}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        per page
      </label>

      <div className="flex items-center gap-3">
        <span className="tabular-nums text-slate-500">
          {total} lead{total === 1 ? '' : 's'} · page {page} of {pageCount}
        </span>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={buttonClass}>
            Prev
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            className={buttonClass}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

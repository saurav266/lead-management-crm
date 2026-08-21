import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import LeadsTable from '../../components/LeadsTable.jsx';
import { AddLeadModal } from '../../components/AddLeadModal.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { DownloadIcon } from '../../components/icons.jsx';

const STATUS_OPTIONS = ['Won', 'Lost', 'Not answered', 'Contacted', 'Broker'];
const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'P5'];
const fieldClass =
  'w-full sm:w-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

export default function MyLeads() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState({ status: '', priority: '', city: '', search: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pageInfo, setPageInfo] = useState({ total: 0, pageCount: 1 });

  useEffect(() => {
    load();
  }, [filters.status, filters.priority, page, pageSize]);

  function buildFilterParams() {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.city) params.set('city', filters.city);
    if (filters.search) params.set('search', filters.search);
    return params;
  }

  function load() {
    setLoading(true);
    const params = buildFilterParams();
    params.set('limit', pageSize);
    params.set('page', page);
    api
      .get(`/leads?${params.toString()}`)
      .then((data) => {
        setLeads(data.leads);
        setPageInfo({ total: data.total, pageCount: data.pageCount });
        // e.g. rejecting the last lead on this page emptied it -- land
        // somewhere that actually has leads instead of a false "none found".
        if (data.page > data.pageCount) setPage(data.pageCount);
      })
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (page === 1) load();
    else setPage(1); // triggers the effect below, which reloads with the new filters
  }

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // a changed filter can shrink the result set below the current page
  }

  async function handleUpdate(leadId, patch) {
    const previous = leads;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
    try {
      const { lead } = await api.patch(`/leads/${leadId}`, patch);
      setLeads((prev) => prev.map((l) => (l.id === leadId ? lead : l)));
      showToast('Saved');
    } catch (err) {
      setLeads(previous);
      showToast(err.message, 'error');
    }
  }

  async function handleReject(leadId) {
    try {
      await api.post(`/leads/${leadId}/reject`, {});
      showToast('Lead rejected — back to unassigned for the admin to reassign');
      load(); // rather than splice locally -- pagination totals need refreshing too
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-slate-900">My Leads</h1>
          <p className="text-sm text-slate-500">Leads assigned to you. Update status, notes, and follow-ups here.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/leads/export"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <DownloadIcon className="h-4 w-4" />
            Export
          </a>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700"
          >
            + Add lead
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSearchSubmit}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-soft"
      >
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} className={fieldClass}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-medium text-slate-500">Priority</label>
          <select value={filters.priority} onChange={(e) => updateFilter('priority', e.target.value)} className={fieldClass}>
            <option value="">All</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-medium text-slate-500">City</label>
          <input
            value={filters.city}
            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
          <input
            placeholder="Name, mobile, or email"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className={fieldClass}
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
        >
          Apply
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <>
          <LeadsTable
            leads={leads}
            editable="employee"
            showAssigned={false}
            showKey={false}
            onUpdate={handleUpdate}
            onReject={handleReject}
          />
          <Pagination
            page={page}
            pageCount={pageInfo.pageCount}
            pageSize={pageSize}
            total={pageInfo.total}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}

      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            if (page === 1) load();
            else setPage(1);
          }}
        />
      )}
    </div>
  );
}

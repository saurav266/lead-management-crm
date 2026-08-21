import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import LeadsTable from '../../components/LeadsTable.jsx';
import { AddLeadModal } from '../../components/AddLeadModal.jsx';
import { ExportLeadsModal } from '../../components/ExportLeadsModal.jsx';
import { UploadIcon, DownloadIcon } from '../../components/icons.jsx';
import { Pagination } from '../../components/Pagination.jsx';

const STATUS_OPTIONS = ['Won', 'Lost', 'Not answered', 'Contacted', 'Broker'];
const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'P5'];
const fieldClass =
  'w-full sm:w-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

export default function Leads() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    assigned: '',
    previouslyAssigned: '',
    status: '',
    priority: '',
    city: '',
    search: '',
    recurring: false,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pageInfo, setPageInfo] = useState({ total: 0, pageCount: 1 });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkEmployeeId, setBulkEmployeeId] = useState('');
  const [notifyEmployee, setNotifyEmployee] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [overwriteOnImport, setOverwriteOnImport] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api
      .get('/employees')
      .then((data) => setEmployees(data.employees))
      .catch((err) => showToast(err.message, 'error'));
  }, []);

  useEffect(() => {
    load();
  }, [filters.assigned, filters.previouslyAssigned, filters.status, filters.priority, filters.recurring, page, pageSize]);

  function buildFilterParams() {
    const params = new URLSearchParams();
    if (filters.assigned) params.set('assigned', filters.assigned);
    if (filters.previouslyAssigned) params.set('previouslyAssigned', filters.previouslyAssigned);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.city) params.set('city', filters.city);
    if (filters.search) params.set('search', filters.search);
    if (filters.recurring) params.set('recurring', 'true');
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
        // e.g. a bulk delete just emptied the last page -- land somewhere
        // that actually has leads on it instead of a false "no leads found".
        if (data.page > data.pageCount) setPage(data.pageCount);
      })
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (page === 1) load();
    else setPage(1); // triggers the effect above, which reloads with the new filters
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

  function toggleSelect(leadId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  // Selects/clears every lead on the current page (leads are paginated, so
  // this is "select all" within the page, not across every filtered match).
  // To delete a whole batch from one import, filter down to just those
  // leads first (by date, or however they're distinguishable), bump the
  // page size if needed so they all land on one page, then Delete selected.
  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))));
  }

  async function handleBulkAssign() {
    if (!bulkEmployeeId || selectedIds.size === 0) return;
    setAssigning(true);
    try {
      const result = await api.post('/leads/assign', {
        leadIds: [...selectedIds],
        employeeId: Number(bulkEmployeeId),
        notify: notifyEmployee,
      });
      showToast(`Assigned ${result.updated} lead(s) to ${result.employee.name}`);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAssigning(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} lead(s)? This can't be undone.`)) return;
    setDeleting(true);
    try {
      const result = await api.post('/leads/delete', { leadIds: [...selectedIds] });
      showToast(`Deleted ${result.deleted} lead(s)`);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('overwrite', String(overwriteOnImport));
      const result = await api.upload('/leads/import', formData);
      const parts = [`${result.created} new`, `${result.updated} updated`];
      if (result.skippedDuplicate) parts.push(`${result.skippedDuplicate} duplicate skipped`);
      showToast(`Import complete: ${parts.join(', ')}`);

      if (result.unmatchedAssignees?.length) {
        showToast(
          `Couldn't match "Assigned" to an employee for: ${result.unmatchedAssignees.join(', ')} — those leads landed unassigned. Create the employee (matching name/email) and re-upload to backfill.`,
          'error'
        );
      }
      if (result.unrecognizedValues?.length) {
        showToast(`Some values didn't match a known option and were defaulted: ${result.unrecognizedValues.join('; ')}`, 'error');
      }

      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setImporting(false);
    }
  }

  const filteredLeads = useMemo(() => leads, [leads]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">Search, filter, and assign leads to your team.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <label
            className="flex w-full items-center gap-1.5 text-xs text-slate-500 sm:w-auto"
            title="Also apply this file's Status/Priority/Notes/Last Contacted/Next Follow-Up to leads that are already in the CRM, not just brand-new ones. Only cells the file actually has a value for are applied — blank cells never clear existing data."
          >
            <input
              type="checkbox"
              checked={overwriteOnImport}
              onChange={(e) => setOverwriteOnImport(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
            />
            Sync into existing leads too
          </label>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            <UploadIcon className="h-4 w-4" />
            {importing ? 'Importing…' : 'Import spreadsheet'}
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            title="Downloads whatever the filters above currently show — clear them first to export everything"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <DownloadIcon className="h-4 w-4" />
            Export
          </button>
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
          <label className="mb-1 block text-xs font-medium text-slate-500">Employee</label>
          <select
            value={filters.assigned}
            onChange={(e) => updateFilter('assigned', e.target.value)}
            className={fieldClass}
          >
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
            <option value="rejected">Rejected — pending reassignment</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-medium text-slate-500">Previously Assigned</label>
          <select
            value={filters.previouslyAssigned}
            onChange={(e) => updateFilter('previouslyAssigned', e.target.value)}
            title="Who had this lead before its current assignment — independent of who has it now, useful for reviewing reassignment history"
            className={fieldClass}
          >
            <option value="">All</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <select
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
            className={fieldClass}
          >
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
          <select
            value={filters.priority}
            onChange={(e) => updateFilter('priority', e.target.value)}
            className={fieldClass}
          >
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
        <label
          className="flex w-full items-center gap-2 pb-2 text-sm text-slate-600 sm:w-auto"
          title="Same person (matched by unique key) submitted a lead form more than once on a different date"
        >
          <input
            type="checkbox"
            checked={filters.recurring}
            onChange={(e) => updateFilter('recurring', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
          />
          Recurring only
        </label>
        <button
          type="submit"
          className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
        >
          Apply
        </button>
      </form>

      <div
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3.5 shadow-soft transition ${
          selectedIds.size > 0 ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200 bg-white'
        }`}
      >
        <span className="text-sm font-medium text-slate-600">{selectedIds.size} selected</span>
        <select
          value={bulkEmployeeId}
          onChange={(e) => setBulkEmployeeId(e.target.value)}
          className={fieldClass}
        >
          <option value="">Assign to…</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={notifyEmployee}
            onChange={(e) => setNotifyEmployee(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
          />
          Notify employee
        </label>
        <button
          onClick={handleBulkAssign}
          disabled={!bulkEmployeeId || selectedIds.size === 0 || assigning}
          className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-50"
        >
          {assigning ? 'Assigning…' : 'Assign selected'}
        </button>
        <button
          onClick={handleBulkDelete}
          disabled={selectedIds.size === 0 || deleting}
          className="rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete selected'}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <>
          <LeadsTable
            leads={filteredLeads}
            editable="admin"
            showAssigned
            employees={employees}
            onUpdate={handleUpdate}
            selectable
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
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
            // Refetch rather than splice the new lead into the current page
            // locally -- pagination totals/page count need refreshing too,
            // and the new lead may not even land on the page being viewed.
            if (page === 1) load();
            else setPage(1); // triggers the effect above, which reloads
          }}
        />
      )}

      {showExportModal && (
        <ExportLeadsModal onClose={() => setShowExportModal(false)} buildFilterParams={buildFilterParams} />
      )}
    </div>
  );
}

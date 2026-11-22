
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { PhoneLink } from '../components/PhoneLink.jsx';
import { EmailLink } from '../components/EmailLink.jsx';

const COLUMNS = [
  {
    status: 'Not answered',
    title: 'New',
    color: 'border-t-sky-400',
    badge: 'bg-sky-50 text-sky-700',
  },
  {
    status: 'Contacted',
    title: 'Contacted',
    color: 'border-t-indigo-400',
    badge: 'bg-indigo-50 text-indigo-700',
  },
  {
    status: 'Broker',
    title: 'Broker',
    color: 'border-t-violet-400',
    badge: 'bg-violet-50 text-violet-700',
  },
  {
    status: 'Won',
    title: 'Won',
    color: 'border-t-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700',
  },
  {
    status: 'Lost',
    title: 'Lost',
    color: 'border-t-rose-400',
    badge: 'bg-rose-50 text-rose-700',
  },
];

const priorityStyles = {
  P1: 'bg-rose-50 text-rose-700',
  P2: 'bg-amber-50 text-amber-700',
  P3: 'bg-slate-100 text-slate-600',
  P5: 'bg-indigo-50 text-indigo-700',
};

function PipelineCard({ lead, onDragStart }) {
  return (
    <article
      draggable
      onDragStart={(event) => onDragStart(event, lead.id)}
      className="group cursor-grab rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md active:cursor-grabbing"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {lead.name || 'Unnamed lead'}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {lead.city || 'Location not specified'}
          </p>
        </div>

        {lead.priority && (
          <span
            className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${
              priorityStyles[lead.priority] || 'bg-slate-100 text-slate-600'
            }`}
          >
            {lead.priority}
          </span>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        {lead.mob && (
          <div className="truncate text-xs text-slate-500">
            <PhoneLink number={lead.mob} />
          </div>
        )}

        {lead.email && (
          <div className="truncate text-xs text-slate-500">
            <EmailLink email={lead.email} />
          </div>
        )}

        {lead.lead_source && (
          <p className="truncate text-xs text-slate-400">
            Source: {lead.lead_source}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="truncate text-xs font-medium text-slate-500">
            {lead.assigned_name || 'Unassigned'}
          </span>
          {lead.recur_count > 1 && (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
              ↻ {lead.recur_count}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Pipeline() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState([]);
  const [search, setSearch] = useState('');
  const [draggingId, setDraggingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get('/leads/pipeline');
      setLeads(result.leads || []);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;

    return leads.filter((lead) =>
      [
        lead.name,
        lead.mob,
        lead.email,
        lead.city,
        lead.lead_source,
        lead.assigned_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [leads, search]);

  const total = filteredLeads.length;
  const won = leads.filter((lead) => lead.status === 'Won').length;

  function handleDragStart(event, leadId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(leadId));
    setDraggingId(leadId);
  }

  async function handleDrop(event, nextStatus) {
    event.preventDefault();

    const leadId = Number(event.dataTransfer.getData('text/plain'));
    setDraggingId(null);

    const lead = leads.find((item) => item.id === leadId);
    if (!lead || savingIds.includes(leadId)) return;

    const previousStatus = lead.status || 'Not answered';
    if (previousStatus === nextStatus) return;

    setLeads((current) =>
      current.map((item) =>
        item.id === leadId ? { ...item, status: nextStatus } : item
      )
    );
    setSavingIds((current) => [...current, leadId]);

    try {
      const result = await api.patch(`/leads/${leadId}`, {
        status: nextStatus,
      });

      setLeads((current) =>
        current.map((item) =>
          item.id === leadId ? result.lead : item
        )
      );

      showToast(`Moved to ${nextStatus === 'Not answered' ? 'New' : nextStatus}`);
    } catch (error) {
      setLeads((current) =>
        current.map((item) =>
          item.id === leadId ? { ...item, status: lead.status } : item
        )
      );
      showToast(error.message, 'error');
    } finally {
      setSavingIds((current) => current.filter((id) => id !== leadId));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Sales workspace
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Lead Pipeline
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track your leads and move opportunities through the sales process.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total leads</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{leads.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Won leads</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{won}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-1">
          <p className="text-xs font-medium text-slate-500">Visible leads</p>
          <p className="mt-2 text-2xl font-bold text-indigo-600">{total}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, phone, email, city or employee..."
          className="w-full rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:ring-indigo-200"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
          Loading pipeline…
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const columnLeads = filteredLeads.filter(
              (lead) => (lead.status || 'Not answered') === column.status
            );

            return (
              <section
                key={column.status}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, column.status)}
                className={`min-w-0 rounded-2xl border border-slate-200 border-t-4 ${column.color} bg-slate-100/70 p-3 transition ${
                  draggingId ? 'ring-1 ring-indigo-100' : ''
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <h2 className="text-sm font-bold text-slate-800">
                    {column.title}
                  </h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${column.badge}`}>
                    {columnLeads.length}
                  </span>
                </div>

                <div className="min-h-36 space-y-3 rounded-xl">
                  {columnLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className={savingIds.includes(lead.id) ? 'opacity-50' : ''}
                    >
                      <PipelineCard
                        lead={lead}
                        onDragStart={handleDragStart}
                      />
                    </div>
                  ))}

                  {columnLeads.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-slate-400">
                      Drop a lead here
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

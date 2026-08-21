import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ContactIcon, AlertIcon, ClockIcon, CheckCircleIcon, XCircleIcon, UsersIcon, SyncIcon } from '../../components/icons.jsx';
import { BarList, SplitBar, RecentAssignmentsList, StatCard, ChartCard } from '../../components/charts.jsx';

// Same person (unique_key) filled out a lead form more than once, on a
// different date -- worth re-targeting since they keep coming back. See
// upsertLeadFromRow (server) for exactly what counts as a recurrence.
function RecurringLeadsList({ items }) {
  if (items.length === 0) {
    return <div className="text-sm text-slate-400">No recurring leads yet</div>;
  }
  return (
    <div className="divide-y divide-slate-100">
      {items.map((lead) => (
        <div key={lead.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="shrink-0 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
            ↻{lead.recur_count}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{lead.name}</div>
            <div className="truncate text-xs text-slate-400">
              {lead.city || '—'} · {lead.status || 'Not set'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_ORDER = ['Won', 'Lost', 'Not answered', 'Contacted', 'Broker'];
const PRIORITY_ORDER = ['P1', 'P2', 'P3', 'P5'];

const fieldClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

function orderBy(items, order, key) {
  return [...items].sort((a, b) => order.indexOf(a[key]) - order.indexOf(b[key]));
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [recentAssignments, setRecentAssignments] = useState(null);

  const [assignFrom, setAssignFrom] = useState(isoDaysAgo(30));
  const [assignTo, setAssignTo] = useState(today());
  const [assignments, setAssignments] = useState(null);
  const [assignLoading, setAssignLoading] = useState(true);

  useEffect(() => {
    api
      .get('/dashboard')
      .then(setData)
      .catch((err) => showToast(err.message, 'error'));
    api
      .get('/dashboard/recent-assignments')
      .then((d) => setRecentAssignments(d.recentAssignments))
      .catch((err) => showToast(err.message, 'error'));
    loadAssignments(isoDaysAgo(30), today());
  }, []);

  function loadAssignments(from, to) {
    setAssignLoading(true);
    api
      .get(`/dashboard/assignments?from=${from}&to=${to}`)
      .then(setAssignments)
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setAssignLoading(false));
  }

  function handleApplyAssignmentRange(e) {
    e.preventDefault();
    loadAssignments(assignFrom, assignTo);
  }

  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;

  const byStatus = orderBy(data.byStatus, STATUS_ORDER, 'status');
  const byPriority = orderBy(data.byPriority, PRIORITY_ORDER, 'priority');
  const byEmployee = [...data.byEmployee].sort((a, b) => b.count - a.count);
  const byCampaign = [...data.byCampaign].sort((a, b) => b.count - a.count);
  const byAdset = [...data.byAdset].sort((a, b) => b.count - a.count);
  const byAdName = [...data.byAdName].sort((a, b) => b.count - a.count);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mb-6 text-sm text-slate-500">Live overview of all leads and activity.</p>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
        <StatCard label="Total Leads" value={data.total} tone="brand" icon={ContactIcon} />
        <StatCard label="Unassigned" value={data.unassigned} tone={data.unassigned > 0 ? 'amber' : 'slate'} icon={UsersIcon} />
        <StatCard label="Due Today" value={data.followUps.dueToday} tone="amber" icon={ClockIcon} />
        <StatCard label="Overdue" value={data.followUps.overdue} tone="red" icon={AlertIcon} />
        <StatCard label="Won" value={data.wonVsLost.won} tone="green" icon={CheckCircleIcon} />
        <StatCard label="Lost" value={data.wonVsLost.lost} tone="red" icon={XCircleIcon} />
        <StatCard label="Recurring" value={data.recurring.count} tone={data.recurring.count > 0 ? 'amber' : 'slate'} icon={SyncIcon} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Leads by Status" subtitle="Pipeline stage">
          <BarList items={byStatus} labelKey="status" emptyLabel="Not set yet" />
        </ChartCard>
        <ChartCard title="Leads by Priority">
          <BarList items={byPriority} labelKey="priority" emptyLabel="Not set yet" />
        </ChartCard>
        <ChartCard title="Leads by Employee" subtitle="Current workload">
          <BarList items={byEmployee} labelKey="employee_name" emptyLabel="No employees yet" />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Won vs Lost" subtitle="Closed-lead outcome split">
          <SplitBar won={data.wonVsLost.won} lost={data.wonVsLost.lost} />
        </ChartCard>
        <ChartCard title="Recently Assigned" subtitle="Newest first, across the whole team">
          {recentAssignments === null ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : (
            <RecentAssignmentsList items={recentAssignments} />
          )}
        </ChartCard>
        <ChartCard title="Recurring Leads" subtitle="Same person, submitted more than once — worth re-targeting">
          <RecurringLeadsList items={data.recurring.leads} />
        </ChartCard>
      </div>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-slate-900">Ad performance</h2>
      <p className="mb-4 text-sm text-slate-500">
        Which campaigns, ad sets, and ads are actually bringing leads in (from imported Facebook/Meta Lead Ads data).
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Leads by Campaign">
          <BarList items={byCampaign} labelKey="campaign_name" emptyLabel="No campaign data yet" />
        </ChartCard>
        <ChartCard title="Leads by Ad Set">
          <BarList items={byAdset} labelKey="adset_name" emptyLabel="No ad set data yet" />
        </ChartCard>
        <ChartCard title="Leads by Ad Name">
          <BarList items={byAdName} labelKey="ad_name" emptyLabel="No ad data yet" />
        </ChartCard>
      </div>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-slate-900">Assignments by date</h2>
      <p className="mb-4 text-sm text-slate-500">
        How many leads were assigned to each employee in a date range (not just what they currently hold).
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3">
        <ChartCard title="Leads Assigned per Employee">
          <form onSubmit={handleApplyAssignmentRange} className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
              <input
                type="date"
                value={assignFrom}
                onChange={(e) => setAssignFrom(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
              <input type="date" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className={fieldClass} />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Apply
            </button>
          </form>
          {assignLoading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : (
            <BarList items={assignments?.byEmployee || []} labelKey="employee_name" emptyLabel="No assignments in range" />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

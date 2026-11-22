
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  ContactIcon,
  AlertIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  UsersIcon,
  SyncIcon,
} from '../../components/icons.jsx';

const STATUS_ORDER = ['Won', 'Lost', 'Not answered', 'Contacted', 'Broker'];
const PRIORITY_ORDER = ['P1', 'P2', 'P3', 'P5'];

const fieldClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100';

function count(value) {
  return Number(value || 0).toLocaleString();
}

function orderBy(items = [], order, key) {
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a[key]);
    const bi = order.indexOf(b[key]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, hint, tone = 'indigo', icon: Icon }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    blue: 'bg-sky-50 text-sky-600 ring-sky-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    red: 'bg-rose-50 text-rose-600 ring-rose-100',
    green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        {Icon && (
          <span className={`grid h-9 w-9 place-items-center rounded-xl ring-1 ${tones[tone] || tones.indigo}`}>
            <Icon />
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{count(value)}</div>
      {hint && <div className="mt-1 text-[11px] font-medium text-slate-400">{hint}</div>}
    </div>
  );
}

function HorizontalBars({
  items = [],
  labelKey,
  emptyLabel = 'No data available',
  color = 'bg-indigo-500',
}) {
  const max = Math.max(1, ...items.map((item) => Number(item.count || 0)));

  if (!items.length) {
    return <p className="py-5 text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const value = Number(item.count || 0);
        const width = Math.max(value > 0 ? 3 : 0, (value / max) * 100);

        return (
          <div key={`${item[labelKey] || 'item'}-${index}`}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium text-slate-700">
                {item[labelKey] || 'Not set'}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                {count(value)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${color}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SplitOutcome({ won = 0, lost = 0 }) {
  const total = Number(won) + Number(lost);
  const wonPercent = total ? (Number(won) / total) * 100 : 0;
  const lostPercent = total ? 100 - wonPercent : 0;

  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
        <div
          className="bg-emerald-500 transition-all"
          style={{ width: `${wonPercent}%` }}
        />
        <div
          className="bg-rose-500 transition-all"
          style={{ width: `${lostPercent}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3">
          <div className="text-xs font-semibold text-emerald-700">Won</div>
          <div className="mt-1 text-xl font-bold text-emerald-800">
            {count(won)}
          </div>
          <div className="text-[11px] text-emerald-700">
            {wonPercent.toFixed(1)}% of closed leads
          </div>
        </div>

        <div className="rounded-xl bg-rose-50 p-3">
          <div className="text-xs font-semibold text-rose-700">Lost</div>
          <div className="mt-1 text-xl font-bold text-rose-800">
            {count(lost)}
          </div>
          <div className="text-[11px] text-rose-700">
            {lostPercent.toFixed(1)}% of closed leads
          </div>
        </div>
      </div>
    </div>
  );
}

function RecurringLeads({ items = [] }) {
  if (!items.length) {
    return <p className="py-5 text-sm text-slate-400">No recurring leads yet.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((lead) => (
        <div
          key={lead.id}
          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-sm font-bold text-amber-700">
            {lead.recur_count}×
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {lead.name}
            </p>
            <p className="truncate text-xs text-slate-400">
              {lead.city || 'Location not set'} · {lead.status || 'Not set'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentAssignments({ items = [] }) {
  if (!items.length) {
    return <p className="py-5 text-sm text-slate-400">No recent assignments.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item, index) => (
        <div
          key={`${item.lead_id}-${item.created_at}-${index}`}
          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700">
            {(item.lead_name || 'L').slice(0, 1).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {item.lead_name}
            </p>
            <p className="truncate text-xs text-slate-400">
              {item.lead_city || '—'} · {item.employee_name || 'Unassigned'}
            </p>
          </div>

          <span className="shrink-0 text-[11px] text-slate-400">
            {item.created_at
              ? new Date(item.created_at).toLocaleDateString()
              : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [recentAssignments, setRecentAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [assignFrom, setAssignFrom] = useState(isoDaysAgo(30));
  const [assignTo, setAssignTo] = useState(today());
  const [assignments, setAssignments] = useState(null);
  const [assignLoading, setAssignLoading] = useState(false);

  const loadDashboard = useCallback(async (quiet = false) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [dashboardResult, recentResult] = await Promise.all([
        api.get('/dashboard'),
        api.get('/dashboard/recent-assignments'),
      ]);

      setData(dashboardResult);
      setRecentAssignments(recentResult?.recentAssignments || []);
    } catch (error) {
      showToast(error.message || 'Unable to load dashboard', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  const loadAssignments = useCallback(async (from, to) => {
    if (from && to && from > to) {
      showToast('The From date cannot be later than the To date.', 'error');
      return;
    }

    setAssignLoading(true);

    try {
      const result = await api.get(
        `/dashboard/assignments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );

      setAssignments(result);
    } catch (error) {
      showToast(error.message || 'Unable to load assignments', 'error');
    } finally {
      setAssignLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDashboard();
    loadAssignments(isoDaysAgo(30), today());
  }, [loadDashboard, loadAssignments]);

  const byStatus = useMemo(
    () => orderBy(data?.byStatus || [], STATUS_ORDER, 'status'),
    [data]
  );

  const byPriority = useMemo(
    () => orderBy(data?.byPriority || [], PRIORITY_ORDER, 'priority'),
    [data]
  );

  const byEmployee = useMemo(
    () =>
      [...(data?.byEmployee || [])].sort(
        (a, b) => Number(b.count) - Number(a.count)
      ),
    [data]
  );

  const byCampaign = useMemo(
    () =>
      [...(data?.byCampaign || [])].sort(
        (a, b) => Number(b.count) - Number(a.count)
      ),
    [data]
  );

  const byAdset = useMemo(
    () =>
      [...(data?.byAdset || [])].sort(
        (a, b) => Number(b.count) - Number(a.count)
      ),
    [data]
  );

  const byAdName = useMemo(
    () =>
      [...(data?.byAdName || [])].sort(
        (a, b) => Number(b.count) - Number(a.count)
      ),
    [data]
  );

  if (loading && !data) {
    return (
      <div className="grid min-h-64 place-items-center">
        <div className="text-sm font-medium text-slate-500">
          Loading admin dashboard…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6">
        <p className="font-semibold text-rose-800">
          Dashboard could not be loaded.
        </p>

        <button
          onClick={() => loadDashboard()}
          className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const closedTotal =
    Number(data.wonVsLost?.won || 0) +
    Number(data.wonVsLost?.lost || 0);

  const conversionRate = data.total
    ? (Number(data.wonVsLost?.won || 0) / Number(data.total)) * 100
    : 0;

  return (
    <div className="min-h-full space-y-6 pb-8">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Admin workspace
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Dashboard
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            A live overview of your leads, team workload and campaign activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-500">
            Updated {new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            <span className={refreshing ? 'animate-spin' : ''}>↻</span>
            Refresh
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <MetricCard
          label="Total Leads"
          value={data.total}
          hint="All leads in CRM"
          tone="indigo"
          icon={ContactIcon}
        />

        <MetricCard
          label="Unassigned"
          value={data.unassigned}
          hint="Need an owner"
          tone="blue"
          icon={UsersIcon}
        />

        <MetricCard
          label="Due Today"
          value={data.followUps?.dueToday}
          hint="Follow-up reminders"
          tone="amber"
          icon={ClockIcon}
        />

        <MetricCard
          label="Overdue"
          value={data.followUps?.overdue}
          hint="Require attention"
          tone="red"
          icon={AlertIcon}
        />

        <MetricCard
          label="Won"
          value={data.wonVsLost?.won}
          hint="Successfully converted"
          tone="green"
          icon={CheckCircleIcon}
        />

        <MetricCard
          label="Lost"
          value={data.wonVsLost?.lost}
          hint="Closed as lost"
          tone="red"
          icon={XCircleIcon}
        />

        <MetricCard
          label="Recurring"
          value={data.recurring?.count}
          hint="Submitted more than once"
          tone="violet"
          icon={SyncIcon}
        />
      </section>

      {/* Pipeline, Priority and Outcomes */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel
          title="Lead pipeline"
          subtitle="Current distribution across lead statuses"
          className="xl:col-span-5"
        >
          <HorizontalBars
            items={byStatus}
            labelKey="status"
            emptyLabel="No lead status data yet."
            color="bg-gradient-to-r from-indigo-500 to-violet-500"
          />
        </Panel>

        <Panel
          title="Lead priority"
          subtitle="How the current pipeline is prioritized"
          className="xl:col-span-3"
        >
          <HorizontalBars
            items={byPriority}
            labelKey="priority"
            emptyLabel="No priority data yet."
            color="bg-sky-500"
          />
        </Panel>

        <Panel
          title="Won vs. lost"
          subtitle="Closed lead outcomes"
          className="xl:col-span-4"
          action={
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {count(closedTotal)} closed
            </span>
          }
        >
          <SplitOutcome
            won={data.wonVsLost?.won}
            lost={data.wonVsLost?.lost}
          />

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
            <span className="text-slate-500">Won / total leads</span>
            <span className="font-bold text-indigo-700">
              {conversionRate.toFixed(1)}%
            </span>
          </div>
        </Panel>
      </section>

      {/* Employees and Assignments */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Employee workload"
          subtitle="Number of leads currently assigned to each employee"
        >
          <HorizontalBars
            items={byEmployee}
            labelKey="employee_name"
            emptyLabel="No employees or assignments yet."
            color="bg-gradient-to-r from-indigo-500 to-blue-500"
          />
        </Panel>

        <Panel
          title="Recent assignments"
          subtitle="Latest lead assignments across the team"
        >
          <RecentAssignments items={recentAssignments} />
        </Panel>
      </section>

      {/* Recurring Leads and Campaigns */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Recurring leads"
          subtitle="People who submitted a lead form more than once"
        >
          <RecurringLeads items={data.recurring?.leads || []} />
        </Panel>

        <Panel
          title="Campaign performance"
          subtitle="Leads attributed to Facebook / Meta campaigns"
          className="xl:col-span-2"
        >
          <HorizontalBars
            items={byCampaign}
            labelKey="campaign_name"
            emptyLabel="No campaign data yet."
            color="bg-gradient-to-r from-violet-500 to-indigo-500"
          />
        </Panel>
      </section>

      {/* Ad Set and Ad Performance */}
      <Panel
        title="Ad set and ad performance"
        subtitle="Imported Facebook / Meta Lead Ads attribution"
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              Leads by ad set
            </h3>

            <HorizontalBars
              items={byAdset}
              labelKey="adset_name"
              emptyLabel="No ad set data yet."
              color="bg-sky-500"
            />
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              Leads by ad
            </h3>

            <HorizontalBars
              items={byAdName}
              labelKey="ad_name"
              emptyLabel="No ad data yet."
              color="bg-emerald-500"
            />
          </div>
        </div>
      </Panel>

      {/* Assignment Date Filter */}
      <Panel
        title="Assignments by date"
        subtitle="How many leads were assigned to each employee during a selected period"
        action={
          <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            Audit-log based
          </span>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            loadAssignments(assignFrom, assignTo);
          }}
          className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-500">
            From
            <input
              type="date"
              value={assignFrom}
              onChange={(event) => setAssignFrom(event.target.value)}
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-500">
            To
            <input
              type="date"
              value={assignTo}
              onChange={(event) => setAssignTo(event.target.value)}
              className={fieldClass}
            />
          </label>

          <button
            type="submit"
            disabled={assignLoading}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {assignLoading ? 'Applying…' : 'Apply filters'}
          </button>
        </form>

        {assignLoading ? (
          <p className="py-4 text-sm text-slate-400">
            Loading assignment report…
          </p>
        ) : (
          <HorizontalBars
            items={assignments?.byEmployee || []}
            labelKey="employee_name"
            emptyLabel="No assignments in this date range."
            color="bg-gradient-to-r from-indigo-500 to-violet-500"
          />
        )}
      </Panel>
    </div>
  );
}

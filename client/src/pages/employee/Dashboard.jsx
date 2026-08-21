import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ContactIcon, ClockIcon, AlertIcon, CheckCircleIcon, TrendingUpIcon } from '../../components/icons.jsx';
import {
  StatCard,
  ChartCard,
  BarList,
  DonutChart,
  RecentAssignmentsList,
  STATUS_CHART_ORDER,
  STATUS_CHART_COLORS,
} from '../../components/charts.jsx';

const PRIORITY_ORDER = ['P1', 'P2', 'P3', 'P5'];

function orderBy(items, order, key) {
  return [...items].sort((a, b) => order.indexOf(a[key]) - order.indexOf(b[key]));
}

export default function Dashboard() {
  const { showToast } = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get('/dashboard/mine')
      .then(setData)
      .catch((err) => showToast(err.message, 'error'));
  }, []);

  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;

  const byStatus = orderBy(data.byStatus, STATUS_CHART_ORDER, 'status');
  const byPriority = orderBy(data.byPriority, PRIORITY_ORDER, 'priority');
  const closed = data.wonVsLost.won + data.wonVsLost.lost;
  const winRate = closed > 0 ? Math.round((data.wonVsLost.won / closed) * 100) : null;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mb-6 text-sm text-slate-500">Your leads, your follow-ups, and how you're doing.</p>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Assigned" value={data.total} tone="brand" icon={ContactIcon} />
        <StatCard label="Due Today" value={data.followUps.dueToday} tone="amber" icon={ClockIcon} />
        <StatCard label="Overdue" value={data.followUps.overdue} tone={data.followUps.overdue > 0 ? 'red' : 'slate'} icon={AlertIcon} />
        <StatCard label="Won" value={data.wonVsLost.won} tone="green" icon={CheckCircleIcon} />
        <StatCard label="Win Rate" value={winRate === null ? '—' : `${winRate}%`} tone="brand" icon={TrendingUpIcon} />
      </div>

      {(data.followUps.overdue > 0 || data.followUps.dueToday > 0) && (
        <Link
          to="/follow-ups"
          className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
        >
          <span>
            {data.followUps.overdue > 0
              ? `${data.followUps.overdue} follow-up${data.followUps.overdue === 1 ? '' : 's'} overdue`
              : `${data.followUps.dueToday} follow-up${data.followUps.dueToday === 1 ? '' : 's'} due today`}
            {' — '}
            take a look
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="My Leads by Status" subtitle="Where your pipeline stands">
          <DonutChart items={byStatus} labelKey="status" colorMap={STATUS_CHART_COLORS} emptyLabel="No leads assigned yet" />
        </ChartCard>
        <ChartCard title="My Leads by Priority">
          <BarList items={byPriority} labelKey="priority" emptyLabel="Not set yet" />
        </ChartCard>
        <ChartCard title="Recently Assigned to Me" subtitle="Newest first">
          <RecentAssignmentsList items={data.recentlyAssigned} showEmployee={false} emptyLabel="Nothing assigned yet" />
        </ChartCard>
      </div>
    </div>
  );
}

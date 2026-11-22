
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';

const activityTypes = [
  { value: 'call', label: 'Call', icon: '☎' },
  { value: 'email', label: 'Email', icon: '✉' },
  { value: 'meeting', label: 'Meeting', icon: '▣' },
  { value: 'note', label: 'Note', icon: '▤' },
  { value: 'other', label: 'Other', icon: '•••' },
];

const activityColors = {
  call: 'bg-emerald-500 text-white',
  email: 'bg-blue-500 text-white',
  meeting: 'bg-violet-600 text-white',
  note: 'bg-amber-500 text-white',
  other: 'bg-slate-500 text-white',
  system: 'bg-indigo-500 text-white',
};

function initials(name) {
  return (name || 'Lead')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDateGroup(value) {
  if (!value) return 'Earlier';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function Card({ children, className = '' }) {
  return (
    <section className={`overflow-hidden rounded-[20px] border border-slate-200/90 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.045)] ${className}`}>
      {children}
    </section>
  );
}

function CardHeader({ icon, title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-indigo-50 bg-gradient-to-r from-white via-white to-indigo-50/70 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg font-bold text-indigo-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right}
    </div>
  );
}

function InfoRow({ icon, label, value, href, copyable }) {
  async function copyValue() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      // Clipboard access may be unavailable in some browsers.
    }
  }

  return (
    <div className="group flex min-w-0 items-center gap-3 border-b border-slate-100 px-1 py-2.5 last:border-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm text-indigo-700">
        {icon}
      </span>

      <span className="w-[105px] shrink-0 text-[11px] font-medium text-slate-600 sm:w-[125px]">
        {label}
      </span>

      <div className="min-w-0 flex-1">
        {href ? (
          <a href={href} className="block truncate text-xs font-bold text-slate-900 hover:text-indigo-700">
            {value || '—'}
          </a>
        ) : (
          <p className="truncate text-xs font-bold text-slate-900">
            {value || '—'}
          </p>
        )}
      </div>

      {copyable && value && (
        <button
          type="button"
          onClick={copyValue}
          title={`Copy ${label}`}
          className="rounded-md p-1.5 text-slate-400 opacity-0 transition hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"
        >
          ⧉
        </button>
      )}

      {href && (
        <a
          href={href}
          title={label === 'Mobile Number' ? 'Call customer' : 'Send email'}
          className="rounded-md p-1.5 text-indigo-600 transition hover:bg-indigo-50"
        >
          {label === 'Mobile Number' ? '☎' : '✉'}
        </a>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm text-indigo-700">
        {icon}
      </span>
      <span className="w-[105px] shrink-0 text-[11px] text-slate-600 sm:w-[125px]">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words text-right text-xs font-bold text-slate-900">
        {value || '—'}
      </span>
    </div>
  );
}

function ActivityIcon({ type }) {
  const activity = activityTypes.find((item) => item.value === type);
  const icon = activity?.icon || (type === 'system' ? '⚙' : '•');

  return (
    <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm shadow-sm ring-4 ring-white ${activityColors[type] || 'bg-slate-500 text-white'}`}>
      {icon}
    </div>
  );
}

function FollowUpStatus({ status }) {
  const styles = {
    Scheduled: 'bg-indigo-50 text-indigo-700',
    Completed: 'bg-emerald-50 text-emerald-700',
    Missed: 'bg-rose-50 text-rose-700',
    Cancelled: 'bg-slate-100 text-slate-600',
    'No Response': 'bg-amber-50 text-amber-700',
  };

  return (
    <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

export default function LeadProfile() {
  const { id } = useParams();
  const { showToast } = useToast();

  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activityType, setActivityType] = useState('call');
  const [description, setDescription] = useState('');

  // Timeline search and filters
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [timelineSearch, setTimelineSearch] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);

    try {
      const [leadResult, activityResult, followUpResult] = await Promise.all([
        api.get(`/leads/${id}`),
        api.get(`/leads/${id}/activities`),
        api.get(`/leads/${id}/follow-ups`),
      ]);

      setLead(leadResult.lead);

      // Existing lead activities
      const leadActivities = (activityResult.activities || []).map(
        (activity) => ({
          ...activity,
          record_type: activity.record_type || 'activity',
          user_name: activity.user_name || 'System',
        })
      );

      // Follow-up history records
      const followUpActivities = (followUpResult.followUps || []).map(
        (followUp) => {
          const details = [
            `Follow-up ${followUp.status}`,
            followUp.outcome
              ? `Outcome: ${followUp.outcome}`
              : null,
            followUp.notes
              ? `Notes: ${followUp.notes}`
              : null,
          ].filter(Boolean);

          return {
            id: followUp.id,
            record_type: 'follow_up',
            type: (followUp.activity_type || 'other').toLowerCase(),
            description: details.join('\n'),
            created_at: followUp.completed_at || followUp.created_at,
            scheduled_at: followUp.scheduled_at,
            completed_at: followUp.completed_at,
            status: followUp.status,
            outcome: followUp.outcome,
            user_name: followUp.employee_name || 'System',
          };
        }
      );

      // Merge both activity sources
      const combinedActivities = [
        ...leadActivities,
        ...followUpActivities,
      ].sort((a, b) => {
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      });

      setActivities(combinedActivities);
    } catch (error) {
      showToast(
        error.message || 'Unable to load lead profile',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleAddActivity(event) {
    event.preventDefault();

    if (!description.trim()) {
      showToast('Please enter an activity description.', 'error');
      return;
    }

    setSaving(true);

    try {
      await api.post(`/leads/${id}/activities`, {
        activity_type: activityType,
        description: description.trim(),
      });

      setDescription('');
      await loadProfile();

      showToast('Activity recorded successfully');
    } catch (error) {
      showToast(
        error.message || 'Unable to save activity',
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  // Apply timeline filters and search
  const filteredActivities = useMemo(() => {
    const query = timelineSearch.trim().toLowerCase();

    return activities.filter((activity) => {
      const isFollowUp = activity.record_type === 'follow_up';
      const isSystem = activity.type === 'system';

      if (
        timelineFilter === 'follow_ups' &&
        !isFollowUp
      ) {
        return false;
      }

      if (
        timelineFilter === 'system' &&
        !isSystem
      ) {
        return false;
      }

      if (
        timelineFilter === 'interactions' &&
        (isFollowUp || isSystem)
      ) {
        return false;
      }

      if (query) {
        const searchable = [
          activity.type,
          activity.description,
          activity.user_name,
          activity.status,
          activity.outcome,
          activity.scheduled_at,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [activities, timelineFilter, timelineSearch]);

  // Group timeline records by date
  const groupedActivities = useMemo(() => {
    return filteredActivities.reduce((groups, activity) => {
      const group = getDateGroup(activity.created_at);

      if (!groups[group]) {
        groups[group] = [];
      }

      groups[group].push(activity);
      return groups;
    }, {});
  }, [filteredActivities]);

  if (loading) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
      </div>
    );
  }

  if (!lead) {
    return (
      <Card className="p-10 text-center">
        <h2 className="font-bold text-slate-900">
          Lead not found
        </h2>

        <Link
          to="/leads"
          className="mt-3 inline-block text-sm font-semibold text-indigo-600"
        >
          Back to leads
        </Link>
      </Card>
    );
  }

  const status = (lead.status || 'Not reviewed').replaceAll('_', ' ');

  const selectedActivity = activityTypes.find(
    (item) => item.value === activityType
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-8">

      {/* Breadcrumb and actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link to="/leads" className="hover:text-indigo-600">
            Workspace
          </Link>
          <span>›</span>
          <Link to="/leads" className="hover:text-indigo-600">
            Leads
          </Link>
          <span>›</span>
          <span className="font-bold text-slate-900">
            Lead Profile
          </span>
        </div>

        <Link
          to="/leads"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-indigo-200 hover:text-indigo-600"
        >
          ← Back to leads
        </Link>
      </div>

      {/* Lead hero */}
      <section className="relative overflow-hidden rounded-[20px] bg-gradient-to-r from-[#211c77] via-[#27216f] to-[#17154e] p-5 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-32 h-80 w-80 rounded-full border-[45px] border-white/[0.035]" />
        <div className="pointer-events-none absolute bottom-[-100px] right-[25%] h-52 w-96 rounded-full bg-violet-500/20 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xl font-bold ring-4 ring-white/10 sm:h-[76px] sm:w-[76px]">
              {initials(lead.name)}
              <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-[3px] border-indigo-900 bg-emerald-400" />
            </div>

            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-indigo-100">
                  Lead ID #{lead.id}
                </span>
              </div>

              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                {lead.name || 'Unnamed lead'}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-indigo-100">
                <span>
                  ◈ {lead.lead_source || lead.source || 'Source not specified'}
                </span>
                {lead.city && <span>⌖ {lead.city}</span>}
                {lead.interested_in && <span>▣ {lead.interested_in}</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
            <div className="rounded-xl border border-emerald-300/25 bg-emerald-400/10 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/20 text-lg text-emerald-300">
                  ♛
                </span>
                <div>
                  <p className="text-[10px] text-emerald-200">
                    Status
                  </p>
                  <p className="mt-0.5 text-sm font-bold capitalize">
                    {status}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-rose-300/25 bg-rose-400/10 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-400/20 text-lg text-rose-300">
                  ⚑
                </span>
                <div>
                  <p className="text-[10px] text-rose-200">
                    Priority
                  </p>
                  <p className="mt-0.5 text-sm font-bold capitalize">
                    {lead.priority || 'Normal'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero actions */}
        <div className="relative mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
          {lead.mob && (
            <a
              href={`tel:${lead.mob}`}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-400"
            >
              ☎ &nbsp;Call Customer
            </a>
          )}

          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-indigo-950 shadow-md transition hover:bg-indigo-50"
            >
              ✉ &nbsp;Send Email
            </a>
          )}

          <button
            type="button"
            onClick={() =>
              document.getElementById('activity-description')?.focus()
            }
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-white/20"
          >
            + &nbsp;Add Activity
          </button>
        </div>
      </section>

      {/* Two-column content */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[0.95fr_1.65fr]">

        {/* LEFT COLUMN */}
        <div className="space-y-4">

          {/* Contact Information */}
          <Card>
            <CardHeader
              icon="♙"
              title="Contact Information"
            />

            <div className="px-5 py-1">
              <InfoRow
                icon="♙"
                label="Full Name"
                value={lead.name}
              />

              <InfoRow
                icon="☎"
                label="Mobile Number"
                value={lead.mob}
                href={lead.mob ? `tel:${lead.mob}` : undefined}
                copyable
              />

              <InfoRow
                icon="✉"
                label="Email Address"
                value={lead.email}
                href={lead.email ? `mailto:${lead.email}` : undefined}
                copyable
              />

              <InfoRow
                icon="⌖"
                label="City / Location"
                value={lead.city}
              />

              <InfoRow
                icon="▦"
                label="Interested In"
                value={lead.interested_in}
              />
            </div>
          </Card>

          {/* Campaign Attribution */}
          <Card>
            <CardHeader
              icon="◎"
              title="Campaign Attribution"
            />

            <div className="px-5 py-1">
              <DetailRow
                icon="◈"
                label="Lead Source"
                value={lead.lead_source || lead.source}
              />
              <DetailRow
                icon="▦"
                label="Platform"
                value={lead.platform}
              />
              <DetailRow
                icon="▣"
                label="Campaign"
                value={lead.campaign_name}
              />
              <DetailRow
                icon="◇"
                label="Ad Set"
                value={lead.adset_name}
              />
              <DetailRow
                icon="▤"
                label="Ad Name"
                value={lead.ad_name}
              />
            </div>
          </Card>

          {/* Ownership */}
          <Card>
            <CardHeader
              icon="♧"
              title="Ownership & Follow-up"
            />

            <div className="p-5">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {initials(lead.assigned_name || 'NA')}
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-slate-500">
                    Assigned Employee
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-slate-900">
                    {lead.assigned_name || 'Unassigned'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <DetailRow
                  icon="▣"
                  label="Next Follow-up"
                  value={formatDate(lead.next_follow_up)}
                />

                <DetailRow
                  icon="◷"
                  label="Last Contacted"
                  value={formatDate(lead.last_contacted)}
                />

                <DetailRow
                  icon="↻"
                  label="Recurring Submissions"
                  value={`${lead.recur_count ?? 0} times`}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">

          {/* Log Activity */}
          <Card>
            <CardHeader
              icon="✎"
              title="Log an Interaction"
              subtitle="Record calls, emails, meetings and important notes for this lead."
            />

            <form onSubmit={handleAddActivity} className="p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {activityTypes.map((type) => {
                  const active = activityType === type.value;

                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setActivityType(type.value)}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs font-bold transition ${
                        active
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                      }`}
                    >
                      <span className="text-base">
                        {type.icon}
                      </span>
                      {type.label}
                    </button>
                  );
                })}
              </div>

              <textarea
                id="activity-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={5000}
                placeholder={`Describe the ${selectedActivity?.label.toLowerCase() || 'activity'}...`}
                className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              />

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDescription('')}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving || !description.trim()}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving...' : '➤ Save Activity'}
                </button>
              </div>
            </form>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader
              icon="⌁"
              title="Activity Timeline"
              subtitle="A complete history of interactions and system updates."
              right={
                <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700">
                  {filteredActivities.length} Records
                </span>
              }
            />

            <div className="space-y-4 p-5 sm:p-6">

              {/* Search and filters */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                  type="search"
                  value={timelineSearch}
                  onChange={(event) => setTimelineSearch(event.target.value)}
                  placeholder="Search activity, outcome, notes or employee..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 lg:max-w-sm"
                />

                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'interactions', label: 'Interactions' },
                    { value: 'follow_ups', label: 'Follow-ups' },
                    { value: 'system', label: 'System Updates' },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setTimelineFilter(filter.value)}
                      className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                        timelineFilter === filter.value
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline content */}
              {filteredActivities.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
                  <span className="text-3xl text-indigo-400">
                    ◷
                  </span>

                  <h3 className="mt-3 text-sm font-bold text-slate-800">
                    No matching activity found
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Try another filter or search term, or record a new interaction.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(groupedActivities).map(([group, items]) => (
                    <div key={group}>
                      <div className="mb-4 flex items-center gap-3">
                        <span className="rounded-lg bg-indigo-100 px-3 py-1.5 text-[11px] font-bold text-indigo-800">
                          {group}
                        </span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>

                      <div className="space-y-0">
                        {items.map((activity, index) => {
                          const isLast = index === items.length - 1;

                          return (
                            <div
                              key={`${activity.record_type}-${activity.id}`}
                              className="relative flex gap-3"
                            >
                              {!isLast && (
                                <div className="absolute bottom-0 left-[15px] top-8 w-px bg-slate-200" />
                              )}

                              <ActivityIcon type={activity.type} />

                              <div className="min-w-0 flex-1 border-b border-slate-100 pb-4 pt-0.5">

                                {/* Activity heading and status */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold capitalize text-slate-900">
                                      {activity.record_type === 'follow_up'
                                        ? `${activity.type} Follow-up`
                                        : activity.type === 'system'
                                          ? 'System Update'
                                          : activity.type}
                                    </span>

                                    {activity.record_type === 'follow_up' &&
                                      activity.status && (
                                        <FollowUpStatus
                                          status={activity.status}
                                        />
                                      )}
                                  </div>

                                  <span className="text-[10px] font-semibold text-slate-500">
                                    ◷ &nbsp;{formatTime(activity.created_at)}
                                  </span>
                                </div>

                                {/* Activity description */}
                                <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                                  {activity.description}
                                </p>

                                {/* Follow-up scheduling details */}
                                {activity.record_type === 'follow_up' && (
                                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-medium text-slate-500">
                                    {activity.scheduled_at && (
                                      <span>
                                        Scheduled: {formatDate(activity.scheduled_at)} at {formatTime(activity.scheduled_at)}
                                      </span>
                                    )}

                                    {activity.completed_at && (
                                      <span className="text-emerald-700">
                                        Completed: {formatDate(activity.completed_at)} at {formatTime(activity.completed_at)}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Employee and timestamp */}
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
                                      {initials(activity.user_name || 'System')}
                                    </span>

                                    <span className="text-[10px] font-semibold text-slate-600">
                                      {activity.user_name || 'System'}
                                    </span>
                                  </div>

                                  <span className="text-[10px] text-slate-400">
                                    {formatDate(activity.created_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

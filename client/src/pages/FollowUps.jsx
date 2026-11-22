
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

const EMPTY_COUNTS = {
  today: 0,
  overdue: 0,
  upcoming: 0,
  completed: 0,
};

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return 'Not scheduled';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getBucket(followUp) {
  if (followUp.status === 'Completed') return 'completed';
  if (!followUp.scheduled_at) return 'upcoming';

  const scheduledDate = new Date(followUp.scheduled_at);
  const now = new Date();

  if (Number.isNaN(scheduledDate.getTime())) return 'upcoming';

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const scheduledDay = new Date(
    scheduledDate.getFullYear(),
    scheduledDate.getMonth(),
    scheduledDate.getDate()
  );

  if (
    followUp.status === 'Missed' ||
    followUp.status === 'No Response' ||
    scheduledDay < today
  ) {
    return 'overdue';
  }

  if (scheduledDay.getTime() === today.getTime()) return 'today';

  return 'upcoming';
}

function statusStyle(status) {
  const styles = {
    Scheduled: 'bg-indigo-50 text-indigo-700',
    Completed: 'bg-emerald-50 text-emerald-700',
    Missed: 'bg-rose-50 text-rose-700',
    'No Response': 'bg-amber-50 text-amber-700',
    Cancelled: 'bg-slate-100 text-slate-600',
  };

  return styles[status] || 'bg-slate-100 text-slate-600';
}

function bucketStyle(bucket) {
  const styles = {
    today: 'bg-indigo-50 text-indigo-700',
    overdue: 'bg-rose-50 text-rose-700',
    upcoming: 'bg-sky-50 text-sky-700',
    completed: 'bg-emerald-50 text-emerald-700',
  };

  return styles[bucket] || 'bg-slate-100 text-slate-600';
}

export default function FollowUps() {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  const [activeTab, setActiveTab] = useState('today');
  const [search, setSearch] = useState('');
  const [assigned, setAssigned] = useState('');

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const [modalLead, setModalLead] = useState(null);
  const [editingFollowUp, setEditingFollowUp] = useState(null);

  const [activityType, setActivityType] = useState('Call');
  const [scheduledAt, setScheduledAt] = useState(
    () => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [notes, setNotes] = useState('');

  // Completion form state
  const [completionItem, setCompletionItem] = useState(null);
  const [completionOutcome, setCompletionOutcome] = useState('Interested');
  const [completionNotes, setCompletionNotes] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');

  const loadFollowUps = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.get('/leads?limit=500');
      const leads = response.leads || [];

      const historyResults = await Promise.all(
        leads.map(async (lead) => {
          try {
            const history = await api.get(`/leads/${lead.id}/follow-ups`);

            return (history.followUps || []).map((followUp) => ({
              ...followUp,
              lead,
              follow_up_bucket: getBucket(followUp),
            }));
          } catch (error) {
            console.error(
              `Could not load follow-ups for lead ${lead.id}:`,
              error
            );
            return [];
          }
        })
      );

      const allItems = historyResults.flat();

      allItems.sort((a, b) => {
        const dateA = a.scheduled_at
          ? new Date(a.scheduled_at).getTime()
          : 0;
        const dateB = b.scheduled_at
          ? new Date(b.scheduled_at).getTime()
          : 0;

        return dateA - dateB;
      });

      setItems(allItems);

      const nextCounts = { ...EMPTY_COUNTS };

      allItems.forEach((item) => {
        nextCounts[item.follow_up_bucket]++;
      });

      setCounts(nextCounts);
    } catch (error) {
      showToast(error.message || 'Could not load follow-ups', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  useEffect(() => {
    if (user?.role !== 'admin') return;

    api
      .get('/employees')
      .then((data) => setEmployees(data.employees || []))
      .catch((error) =>
        showToast(error.message || 'Could not load employees', 'error')
      );
  }, [user?.role, showToast]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const lead = item.lead;

      if (item.follow_up_bucket !== activeTab) return false;

      if (assigned && String(lead.assigned_user_id) !== assigned) {
        return false;
      }

      if (search.trim()) {
        const query = search.trim().toLowerCase();

        const searchable = [
          lead.name,
          lead.mob,
          lead.email,
          lead.city,
          item.notes,
          item.outcome,
          item.activity_type,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable.includes(query)) return false;
      }

      return true;
    });
  }, [items, activeTab, assigned, search]);

  function openCreate(lead) {
    setModalLead(lead);
    setEditingFollowUp(null);
    setActivityType('Call');
    setScheduledAt(
      localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))
    );
    setNotes('');
  }

  function openEdit(item) {
    setModalLead(item.lead);
    setEditingFollowUp(item);
    setActivityType(item.activity_type || 'Call');
    setScheduledAt(
      item.scheduled_at
        ? localDateTimeValue(new Date(item.scheduled_at))
        : ''
    );
    setNotes(item.notes || '');
  }

  function closeModal() {
    setModalLead(null);
    setEditingFollowUp(null);
    setNotes('');
  }

  async function saveFollowUp(event) {
    event.preventDefault();

    if (!modalLead) return;

    if (!scheduledAt) {
      showToast('Please select a follow-up date and time', 'error');
      return;
    }

    const key = editingFollowUp?.id || modalLead.id;
    setSavingId(key);

    try {
      if (editingFollowUp) {
        await api.patch(
          `/leads/${modalLead.id}/follow-ups/${editingFollowUp.id}`,
          {
            scheduled_at: scheduledAt,
            notes: notes.trim() || null,
          }
        );

        showToast('Follow-up updated successfully');
      } else {
        await api.post(`/leads/${modalLead.id}/follow-ups`, {
          activity_type: activityType,
          scheduled_at: scheduledAt,
          status: 'Scheduled',
          notes: notes.trim() || null,
        });

        showToast('Follow-up scheduled successfully');
      }

      closeModal();
      await loadFollowUps();
    } catch (error) {
      showToast(error.message || 'Could not save follow-up', 'error');
    } finally {
      setSavingId(null);
    }
  }

  function openCompletionForm(item) {
    setCompletionItem(item);
    setCompletionOutcome('Interested');
    setCompletionNotes(item.notes || '');
    setNextFollowUpAt('');
  }

  function closeCompletionForm() {
    setCompletionItem(null);
    setCompletionOutcome('Interested');
    setCompletionNotes('');
    setNextFollowUpAt('');
  }

  async function saveCompletion(event) {
    event.preventDefault();

    if (!completionItem) return;

    if (nextFollowUpAt) {
      const nextDate = new Date(nextFollowUpAt);

      if (Number.isNaN(nextDate.getTime()) || nextDate <= new Date()) {
        showToast('The next follow-up must be in the future', 'error');
        return;
      }
    }

    setSavingId(completionItem.id);

    try {
      await api.patch(
        `/leads/${completionItem.lead.id}/follow-ups/${completionItem.id}`,
        {
          status: 'Completed',
          outcome: completionOutcome,
          notes: completionNotes.trim() || null,
        }
      );

      if (nextFollowUpAt) {
        await api.post(`/leads/${completionItem.lead.id}/follow-ups`, {
          activity_type: completionItem.activity_type || 'Call',
          scheduled_at: nextFollowUpAt,
          status: 'Scheduled',
          notes: 'Next follow-up after previous interaction.',
        });
      }

      showToast(
        nextFollowUpAt
          ? 'Interaction completed and next follow-up scheduled'
          : 'Follow-up completed successfully'
      );

      closeCompletionForm();
      await loadFollowUps();
    } catch (error) {
      showToast(error.message || 'Could not save completion details', 'error');
      await loadFollowUps();
    } finally {
      setSavingId(null);
    }
  }

  async function updateStatus(item, status) {
    setSavingId(item.id);

    try {
      await api.patch(
        `/leads/${item.lead.id}/follow-ups/${item.id}`,
        { status }
      );

      showToast(`Follow-up marked ${status.toLowerCase()}`);
      await loadFollowUps();
    } catch (error) {
      showToast(error.message || 'Could not update follow-up', 'error');
    } finally {
      setSavingId(null);
    }
  }

  const summaryCards = [
    {
      id: 'today',
      label: "Today's follow-ups",
      count: counts.today,
      icon: '◷',
      accent: 'text-indigo-600',
      iconBg: 'bg-indigo-50',
    },
    {
      id: 'overdue',
      label: 'Overdue',
      count: counts.overdue,
      icon: '!',
      accent: 'text-rose-600',
      iconBg: 'bg-rose-50',
    },
    {
      id: 'upcoming',
      label: 'Upcoming',
      count: counts.upcoming,
      icon: '↗',
      accent: 'text-sky-600',
      iconBg: 'bg-sky-50',
    },
    {
      id: 'completed',
      label: 'Completed',
      count: counts.completed,
      icon: '✓',
      accent: 'text-emerald-600',
      iconBg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
            Lead operations
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Follow-up Center
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage scheduled conversations and track every interaction.
          </p>
        </div>

        <button
          onClick={loadFollowUps}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <span>↻</span>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <button
            key={card.id}
            onClick={() => setActiveTab(card.id)}
            className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              activeTab === card.id
                ? 'border-indigo-300 ring-2 ring-indigo-100'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                {card.label}
              </span>

              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold ${card.iconBg} ${card.accent}`}
              >
                {card.icon}
              </span>
            </div>

            <div className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
              {card.count}
            </div>

            <div className="mt-2 text-xs text-slate-400">
              View {card.label.toLowerCase()}
            </div>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Follow-up history
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Review activities, update outcomes, and schedule conversations.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search lead or activity..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-64"
              />

              {user?.role === 'admin' && (
                <select
                  value={assigned}
                  onChange={(event) => setAssigned(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:w-48"
                >
                  <option value="">All employees</option>

                  {employees
                    .filter((employee) => employee.active)
                    .map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
                <span className="ml-2 opacity-75">{counts[tab.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-500">
            Loading follow-up history...
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">
              ✓
            </div>

            <h3 className="mt-4 font-semibold text-slate-900">
              No follow-ups here
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              No activities match this category or search.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleItems.map((item) => {
              const lead = item.lead;
              const isSaving = savingId === item.id;

              return (
                <article
                  key={item.id}
                  className="p-5 transition hover:bg-slate-50/70"
                >
                  <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-sm">
                        {(lead.name || 'L').slice(0, 1).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <Link
                          to={`/leads/${lead.id}`}
                          className="font-semibold text-slate-900 transition hover:text-indigo-600"
                        >
                          {lead.name || 'Unnamed lead'}
                        </Link>

                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          {lead.mob && <span>{lead.mob}</span>}
                          {lead.email && <span>{lead.email}</span>}
                          {lead.city && <span>{lead.city}</span>}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            {item.activity_type}
                          </span>

                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${bucketStyle(item.follow_up_bucket)}`}
                          >
                            {item.follow_up_bucket}
                          </span>

                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}
                          >
                            {item.status}
                          </span>

                          {user?.role === 'admin' && item.employee_name && (
                            <span className="text-xs text-slate-400">
                              Recorded by {item.employee_name}
                            </span>
                          )}
                        </div>

                        {item.notes && (
                          <p className="mt-2 max-w-xl text-sm text-slate-600">
                            {item.notes}
                          </p>
                        )}

                        {item.outcome && (
                          <p className="mt-1 text-xs font-medium text-emerald-700">
                            Outcome: {item.outcome}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
                      <div className="min-w-40">
                        <div className="text-xs font-medium text-slate-400">
                          Scheduled date
                        </div>

                        <div className="mt-1 text-sm font-semibold text-slate-800">
                          {formatDate(item.scheduled_at)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {item.status !== 'Completed' &&
                          item.status !== 'Cancelled' && (
                            <>
                              <button
                                onClick={() => openEdit(item)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600"
                              >
                                Reschedule / Edit
                              </button>

                              <button
                                onClick={() => openCompletionForm(item)}
                                disabled={isSaving}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Mark completed
                              </button>

                              <button
                                onClick={() => updateStatus(item, 'Missed')}
                                disabled={isSaving}
                                className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                              >
                                Missed
                              </button>
                            </>
                          )}

                        {item.status === 'Completed' && (
                          <button
                            onClick={() => openCreate(lead)}
                            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                          >
                            Schedule again
                          </button>
                        )}

                        <Link
                          to={`/leads/${lead.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                          View lead
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Completion outcome modal */}
      {completionItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveCompletion}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  Interaction completed
                </p>

                <h3 className="mt-1 text-xl font-bold text-slate-900">
                  Record outcome
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {completionItem.lead.name} · {completionItem.activity_type}
                </p>
              </div>

              <button
                type="button"
                onClick={closeCompletionForm}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Close completion form"
              >
                ✕
              </button>
            </div>

            <label className="mt-6 block text-sm font-semibold text-slate-700">
              Interaction outcome
            </label>

            <select
              value={completionOutcome}
              onChange={(event) => setCompletionOutcome(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="Interested">Interested</option>
              <option value="Not Interested">Not Interested</option>
              <option value="No Response">No Response</option>
              <option value="Callback Required">Callback Required</option>
              <option value="Meeting Scheduled">Meeting Scheduled</option>
              <option value="Converted">Converted</option>
            </select>

            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Interaction notes
            </label>

            <textarea
              rows={4}
              maxLength={5000}
              value={completionNotes}
              onChange={(event) => setCompletionNotes(event.target.value)}
              placeholder="What happened during the conversation?"
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Schedule next follow-up (optional)
            </label>

            <input
              type="datetime-local"
              value={nextFollowUpAt}
              min={localDateTimeValue()}
              onChange={(event) => setNextFollowUpAt(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCompletionForm}
                disabled={savingId !== null}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingId !== null}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingId !== null ? 'Saving...' : 'Save outcome'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New / Edit follow-up modal */}
      {modalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveFollowUp}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Follow-up management
                </p>

                <h3 className="mt-1 text-xl font-bold text-slate-900">
                  {editingFollowUp ? 'Edit follow-up' : 'New follow-up'}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  For {modalLead.name || 'this lead'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {!editingFollowUp && (
              <>
                <label className="mt-6 block text-sm font-semibold text-slate-700">
                  Activity type
                </label>

                <select
                  value={activityType}
                  onChange={(event) => setActivityType(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="Call">Call</option>
                  <option value="Email">Email</option>
                  <option value="Meeting">Meeting</option>
                  <option value="Other">Other</option>
                </select>
              </>
            )}

            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Follow-up date and time
            </label>

            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Notes
            </label>

            <textarea
              rows={4}
              maxLength={5000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add details about this follow-up..."
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!scheduledAt || savingId !== null}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingId !== null
                  ? 'Saving...'
                  : editingFollowUp
                    ? 'Save changes'
                    : 'Create follow-up'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

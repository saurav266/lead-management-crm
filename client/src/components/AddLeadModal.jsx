import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { XCircleIcon } from './icons.jsx';

const fieldClass =
  'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

const emptyForm = { name: '', mob: '', email: '', city: '', date: '', interested_in: '' };

// Shared "add a lead by hand" form for both the admin Leads page and the
// employee My Leads page. The backend auto-assigns employee-created leads to
// themselves; admin-created ones start unassigned -- this component doesn't
// need to know which, it just posts the details.
export function AddLeadModal({ onClose, onCreated }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { lead } = await api.post('/leads', {
        name: form.name,
        mob: form.mob,
        email: form.email || undefined,
        city: form.city || undefined,
        date: form.date || undefined,
        interested_in: form.interested_in || undefined,
      });
      showToast('Lead added');
      onCreated(lead);
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add lead</h2>
          <button onClick={onClose} className="text-slate-400 transition hover:text-slate-600" aria-label="Close">
            <XCircleIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Name</label>
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Mobile</label>
            <input
              required
              value={form.mob}
              onChange={(e) => setForm({ ...form, mob: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">City</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={fieldClass}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Interested In</label>
            <input
              placeholder="e.g. Aakar Gap"
              value={form.interested_in}
              onChange={(e) => setForm({ ...form, interested_in: e.target.value })}
              className={fieldClass}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

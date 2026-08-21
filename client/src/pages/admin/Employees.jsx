import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { UsersIcon, CheckCircleIcon } from '../../components/icons.jsx';
import { PhoneLink } from '../../components/PhoneLink.jsx';

const emptyForm = { name: '', email: '', phone: '', password: '' };
const inputClass =
  'rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Employees() {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  // Passwords are hashed, one-way -- there's no "look it up later" column.
  // The one moment we can show it in the clear is right after you set it, so
  // that's surfaced prominently here instead of a toast that vanishes fast.
  const [justCreated, setJustCreated] = useState(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    api
      .get('/employees')
      .then((data) => setEmployees(data.employees))
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const { employee } = await api.post('/employees', form);
      setEmployees((prev) => [...prev, employee].sort((a, b) => a.name.localeCompare(b.name)));
      setJustCreated({ email: employee.email, password: form.password });
      setForm(emptyForm);
      showToast('Employee created');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(employee) {
    try {
      const { employee: updated } = await api.patch(`/employees/${employee.id}`, { active: !employee.active });
      setEmployees((prev) => prev.map((e) => (e.id === employee.id ? updated : e)));
      showToast(updated.active ? 'Employee activated' : 'Employee deactivated');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleResetPassword(employee) {
    const password = window.prompt(`New password for ${employee.name} (min 6 characters):`);
    if (!password) return;
    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    try {
      await api.patch(`/employees/${employee.id}`, { password });
      showToast(`Password reset for ${employee.name} — give them: ${password}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDelete(employee) {
    if (
      !window.confirm(
        `Permanently delete ${employee.name}? Their leads will become unassigned rather than being deleted. This can't be undone — use Deactivate instead if you just want to block their login.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/employees/${employee.id}`);
      setEmployees((prev) => prev.filter((e) => e.id !== employee.id));
      showToast(`${employee.name} deleted`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function copyCredentials() {
    const text = `Email: ${justCreated.email}\nPassword: ${justCreated.password}`;
    navigator.clipboard?.writeText(text).then(
      () => showToast('Credentials copied'),
      () => showToast('Could not copy — select the text manually', 'error')
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Employees</h1>
      <p className="mb-6 text-sm text-slate-500">Create and manage employee accounts.</p>

      {justCreated && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <div className="text-sm text-green-900">
              <div className="font-medium">Employee created — save these credentials now, they won't be shown again:</div>
              <div className="mt-1 font-mono text-xs">
                {justCreated.email} / {justCreated.password}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyCredentials}
              className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100"
            >
              Copy
            </button>
            <button
              onClick={() => setJustCreated(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-5"
      >
        <input
          placeholder="Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
        />
        <input
          type="email"
          placeholder="Email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={inputClass}
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className={inputClass}
        />
        <input
          type="password"
          placeholder="Password (min 6 chars)"
          required
          minLength={6}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-50"
        >
          {creating ? 'Adding…' : 'Add employee'}
        </button>
      </form>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium text-slate-600">No employees yet</div>
          <div className="text-xs text-slate-400">Add one using the form above.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-soft">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80">
              <tr>
                <th className="px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</th>
                <th className="px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                <th className="px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</th>
                <th className="px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-3.5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <tr key={emp.id} className="transition hover:bg-slate-50/70">
                  <td className="px-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                        {initials(emp.name)}
                      </div>
                      <span className="font-medium text-slate-800">{emp.name}</span>
                    </div>
                  </td>
                  <td className="px-3.5 py-3 text-slate-600">{emp.email}</td>
                  <td className="px-3.5 py-3 text-slate-600">
                    <PhoneLink number={emp.phone} />
                  </td>
                  <td className="px-3.5 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        emp.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${emp.active ? 'bg-green-500' : 'bg-slate-400'}`} />
                      {emp.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-3.5 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleResetPassword(emp)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => toggleActive(emp)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        {emp.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(emp)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

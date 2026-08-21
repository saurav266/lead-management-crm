import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../context/ToastContext.jsx';
import LeadsTable from '../../components/LeadsTable.jsx';

export default function FollowUpsDue() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    api
      .get('/leads/follow-ups-due')
      .then((data) => setLeads(data.leads))
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }

  async function handleUpdate(leadId, patch) {
    const previous = leads;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
    try {
      const { lead } = await api.patch(`/leads/${leadId}`, patch);
      // If the follow-up date moved past today, it drops off this list.
      setLeads((prev) => (lead.next_follow_up && lead.next_follow_up <= today() ? prev.map((l) => (l.id === leadId ? lead : l)) : prev.filter((l) => l.id !== leadId)));
      showToast('Saved');
    } catch (err) {
      setLeads(previous);
      showToast(err.message, 'error');
    }
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  async function handleReject(leadId) {
    try {
      await api.post(`/leads/${leadId}/reject`, {});
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      showToast('Lead rejected — back to unassigned for the admin to reassign');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Follow-ups Due</h1>
      <p className="mb-6 text-sm text-slate-500">Leads with a next follow-up date today or earlier.</p>
      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <LeadsTable
          leads={leads}
          editable="employee"
          showAssigned={false}
          showKey={false}
          onUpdate={handleUpdate}
          onReject={handleReject}
        />
      )}
    </div>
  );
}

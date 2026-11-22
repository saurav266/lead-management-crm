import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import AdminLeads from './pages/admin/Leads.jsx';
import Employees from './pages/admin/Employees.jsx';
import EmployeeDashboard from './pages/employee/Dashboard.jsx';
import MyLeads from './pages/employee/MyLeads.jsx';
import FollowUpsDue from './pages/employee/FollowUpsDue.jsx';
import Pipeline from './pages/Pipeline.jsx';
import LeadProfile from './pages/LeadProfile.jsx';
import FollowUps from './pages/FollowUps.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {user?.role === 'admin' ? (
            <>
              <Route index element={<Dashboard />} />
              <Route path="leads" element={<AdminLeads />} />
              <Route path="employees" element={<Employees />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="follow-ups" element={<FollowUps />} />
            </>
          ) : (
            <>
              <Route index element={<EmployeeDashboard />} />
              <Route path="leads" element={<MyLeads />} />
              <Route path="follow-ups" element={<FollowUps />} />
            </>
          )}
          <Route path="leads/:id" element={<LeadProfile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

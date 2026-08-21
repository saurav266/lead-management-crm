import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import { Wordmark } from './Wordmark.jsx';
import { GridIcon, ContactIcon, UsersIcon, ClockIcon, SyncIcon, LogoutIcon, MenuIcon, XCircleIcon } from './icons.jsx';

const adminLinks = [
  { to: '/', label: 'Dashboard', end: true, icon: GridIcon },
  { to: '/leads', label: 'Leads', icon: ContactIcon },
  { to: '/employees', label: 'Employees', icon: UsersIcon },
];

const employeeLinks = [
  { to: '/', label: 'Dashboard', end: true, icon: GridIcon },
  { to: '/leads', label: 'My Leads', icon: ContactIcon },
  { to: '/follow-ups', label: 'Follow-ups Due', icon: ClockIcon },
];

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const links = user.role === 'admin' ? adminLinks : employeeLinks;

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const result = await api.post('/sync/now', {});
      if (result.skipped) {
        showToast(result.reason || 'Sync skipped', 'error');
      } else {
        showToast(`Sync complete: ${result.created} new, ${result.updated} updated`);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex-1">
          <Wordmark size="sm" />
          <div className="mt-1 text-center text-[0.65rem] text-slate-400">Lead Management CRM</div>
        </div>
        <button
          onClick={() => setMenuOpen(false)}
          className="ml-2 text-slate-400 transition hover:text-slate-600 lg:hidden"
          aria-label="Close menu"
        >
          <XCircleIcon className="h-6 w-6" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" />
              {link.label}
            </NavLink>
          );
        })}
      </nav>

      {user.role === 'admin' && (
        <div className="px-3 pb-1">
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            <SyncIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-800">{user.name}</div>
          <div className="truncate text-xs capitalize text-slate-400">{user.role}</div>
        </div>
        <button
          onClick={logout}
          title="Logout"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <LogoutIcon className="h-4 w-4" />
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          className="text-slate-500 transition hover:text-slate-800"
          aria-label="Open menu"
        >
          <MenuIcon className="h-6 w-6" />
        </button>
        <Wordmark size="sm" />
        <div className="w-6" />
      </div>

      {/* Mobile drawer backdrop */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      <main className="min-w-0 flex-1 overflow-x-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <Outlet />
      </main>
    </div>
  );
}

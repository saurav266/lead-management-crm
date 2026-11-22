
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import { Wordmark } from './Wordmark.jsx';
import {
  GridIcon,
  ContactIcon,
  UsersIcon,
  ClockIcon,
  SyncIcon,
  LogoutIcon,
  MenuIcon,
  XCircleIcon,
} from './icons.jsx';

const adminLinks = [
  { to: '/', label: 'Overview', end: true, icon: GridIcon },
  { to: '/leads', label: 'Leads', icon: ContactIcon },
  { to: '/employees', label: 'Team Members', icon: UsersIcon },
  { to: '/pipeline', label: 'Pipeline', icon: ContactIcon },
  { to: '/follow-ups', label: 'Follow-ups', icon: ClockIcon },
];

const employeeLinks = [
  { to: '/', label: 'Overview', end: true, icon: GridIcon },
  { to: '/leads', label: 'My Leads', icon: ContactIcon },
  { to: '/follow-ups', label: 'Follow-ups', icon: ClockIcon },
  { to: '/pipeline', label: 'Pipeline', icon: ContactIcon },
];

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();

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
        showToast(
          `Sync complete: ${result.created} new, ${result.updated} updated`
        );
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  }

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="flex h-[76px] items-center border-b border-white/10 px-6">
        <div className="flex-1">
          <div className="rounded-lg bg-white px-3 py-2">
            <Wordmark size="sm" />
          </div>
          <p className="mt-2 text-center text-[10px] font-medium tracking-[0.18em] text-slate-400">
            BUSINESS MANAGEMENT
          </p>
        </div>

        <button
          onClick={() => setMenuOpen(false)}
          className="ml-3 text-slate-400 transition hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <XCircleIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Navigation */}
      <div className="px-5 pt-7 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Workspace
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-500/15 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-indigo-400" />
                  )}

                  <Icon
                    className={`h-[19px] w-[19px] shrink-0 ${
                      isActive
                        ? 'text-indigo-300'
                        : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  />

                  <span>{link.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Sync */}
      {user.role === 'admin' && (
        <div className="px-4 pb-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="mb-2 text-xs font-medium text-slate-300">
              Data synchronization
            </p>

            <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
              Keep your connected Google Sheet updated.
            </p>

            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              <SyncIcon
                className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
              />
              {syncing ? 'Synchronizing...' : 'Sync now'}
            </button>
          </div>
        </div>
      )}

      {/* User profile */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-sm font-bold text-indigo-200">
            {initials(user.name)}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {user.name}
            </p>
            <p className="mt-0.5 text-xs capitalize text-slate-400">
              {user.role} account
            </p>
          </div>

          <button
            onClick={logout}
            title="Logout"
            aria-label="Logout"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f6f7fb] lg:flex">
      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <MenuIcon className="h-6 w-6" />
        </button>

        <Wordmark size="sm" />

        <div className="w-10" />
      </header>

      {/* Mobile backdrop */}
      {menuOpen && (
        <button
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-[#101828] transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main workspace */}
      <main className="min-w-0 flex-1">
        {/* Desktop top header */}
        <header className="sticky top-0 z-10 hidden h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-8 backdrop-blur-xl lg:flex">
          <div>
            <p className="text-xs font-medium text-slate-400">
              Workspace / {user.role === 'admin' ? 'Administration' : 'Employee'}
            </p>
            <h1 className="mt-1 text-sm font-semibold text-slate-800">
              {links.find((link) =>
                link.end
                  ? location.pathname === link.to
                  : location.pathname.startsWith(link.to)
              )?.label || 'Workspace'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-700">
                {user.name}
              </p>
              <p className="text-[11px] capitalize text-slate-400">
                {user.role}
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700">
              {initials(user.name)}
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

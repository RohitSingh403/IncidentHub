import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useAuth } from '../context/AuthContext';

const links = [
  ['/dashboard', 'Dashboard'],
  ['/incidents', 'Incidents'],
  ['/services', 'Services'],
  ['/teams', 'Teams'],
  ['/on-call', 'On-call'],
  ['/escalation', 'Escalation'],
  ['/postmortems', 'Postmortems'],
  ['/status-pages', 'Status'],
  ['/settings', 'Settings'],
];

function NavItems({ onNavigate }) {
  return links.map(([to, label]) => (
    <NavLink
      key={to}
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`
      }
    >
      {label}
    </NavLink>
  ));
}

export function Shell({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api('/api/notifications'),
    refetchInterval: 10000,
  });
  const items = notifications.data?.data?.items || [];
  const unread = notifications.data?.data?.unreadCount || 0;
  const usage = user?.organization?.usage;

  async function markAll() {
    await api('/api/notifications/read-all', { method: 'POST' });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line bg-panel/80 md:flex md:flex-col">
        <div className="px-5 py-6">
          <p className="font-mono text-xs tracking-[0.18em] text-signal">INCIDENTHUB</p>
          <p className="mt-2 text-sm text-muted">{user?.organization?.name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          <NavItems />
        </nav>
        {usage ? (
          <div className="space-y-1 px-5 py-5 font-mono text-xs text-muted">
            <p>Services {usage.services.used}/{usage.services.max}</p>
            <p>Teams {usage.teams.used}/{usage.teams.max}</p>
            <p>Members {usage.members.used}/{usage.members.max}</p>
            {usage.statusPages ? <p>Status {usage.statusPages.used}/{usage.statusPages.max}</p> : null}
            <p className="pt-2 uppercase tracking-wide">{user.organization.plan} plan</p>
          </div>
        ) : null}
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 md:px-8">
          <div className="flex items-center gap-4 overflow-x-auto md:hidden">
            <span className="font-mono text-xs text-signal">IH</span>
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} className="whitespace-nowrap text-sm text-muted">
                {label}
              </NavLink>
            ))}
          </div>
          <p className="hidden text-sm text-muted md:block">{user?.name}</p>
          <div className="relative flex items-center gap-3">
            <button
              className="relative rounded-md border border-line px-3 py-1.5 text-sm"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              Alerts
              {unread > 0 ? <span className="ml-2 font-mono text-signal">{unread}</span> : null}
            </button>
            <button
              className="text-sm text-muted hover:text-ink"
              onClick={() => {
                signOut();
                navigate('/login');
              }}
            >
              Log out
            </button>
            {open ? (
              <div className="absolute right-0 top-11 z-20 w-80 rounded-xl border border-line bg-panel p-2 shadow-2xl">
                <div className="flex items-center justify-between px-2 py-1">
                  <p className="text-sm font-medium">Notifications</p>
                  <button className="text-xs text-muted" onClick={markAll}>
                    Mark read
                  </button>
                </div>
                <div className="max-h-80 overflow-auto">
                  {items.length === 0 ? <p className="px-2 py-6 text-sm text-muted">No alerts yet.</p> : null}
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className="block w-full rounded-md px-2 py-2 text-left hover:bg-panel-2"
                      onClick={() => {
                        setOpen(false);
                        if (item.incidentId) navigate(`/incidents/${item.incidentId}`);
                      }}
                    >
                      <p className={`text-sm ${item.readAt ? 'text-muted' : 'text-ink'}`}>{item.title}</p>
                      <p className="text-xs text-muted">{item.body}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">{timeAgo(item.createdAt)}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

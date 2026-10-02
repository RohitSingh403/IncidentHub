import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMinutes, formatPercent, greeting, timeAgo } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Empty, Panel, SeverityBadge, StatusBadge, StatusDot } from '../components/ui';

export function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api('/api/dashboard'),
    refetchInterval: 10000,
  });
  const onCall = useQuery({
    queryKey: ['oncall'],
    queryFn: () => api('/api/on-call/schedules'),
    refetchInterval: 10000,
  });
  const data = dashboard.data?.data;
  const currentOnCall = (onCall.data?.data || []).filter((schedule) => schedule.current?.name);

  if (dashboard.isLoading) return <p className="text-muted">Loading the board…</p>;
  if (dashboard.error) return <p className="text-danger">{dashboard.error.message}</p>;

  const stats = [
    ['Services', data.services],
    ['Open incidents', data.openIncidents],
    ['Uptime, 24h', formatPercent(data.uptimePercent)],
    ['MTTR, 30d', formatMinutes(data.mttrMinutes)],
    ['MTTA, 30d', formatMinutes(data.mttaMinutes)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{greeting(user?.name || 'there')}</h1>
        <p className="mt-1 text-sm text-muted">{user?.organization?.timezone} · checks refresh on their own</p>
        {currentOnCall.length ? (
          <p className="mt-2 text-sm">
            On-call: {currentOnCall.map((schedule) => `${schedule.current.name} (${schedule.teamName || schedule.name})`).join(', ')}
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value]) => (
          <Panel key={label} className="px-4 py-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 font-mono text-2xl">{value}</p>
          </Panel>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Panel>
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-medium">Active incidents</h2>
          </div>
          {data.activeIncidents.length === 0 ? (
            <Empty title="No active incidents" body="Monitoring stays quiet until a failure threshold is reached." />
          ) : (
            <ul>
              {data.activeIncidents.map((incident) => (
                <li key={incident.id} className="border-b border-line last:border-0">
                  <Link to={`/incidents/${incident.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-panel-2">
                    <span>
                      <span className="font-mono text-xs text-muted">{incident.number}</span>
                      <span className="mt-1 block">{incident.title}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <SeverityBadge severity={incident.severity} />
                      <StatusBadge status={incident.status} />
                      <span className="font-mono text-xs text-muted">{timeAgo(incident.detectedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-medium">Service health</h2>
          </div>
          {data.serviceHealth.length === 0 ? (
            <Empty title="No services yet" body="Add a service to start health checks." />
          ) : (
            <ul>
              {data.serviceHealth.map((service) => (
                <li key={service.id}>
                  <Link to={`/services/${service.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-panel-2">
                    <span className="flex items-center gap-2">
                      <StatusDot status={service.status} />
                      {service.name}
                    </span>
                    <span className="font-mono text-xs capitalize text-muted">{service.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

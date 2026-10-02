import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatWhen } from '../lib/format';
import { Empty, Panel } from '../components/ui';

export function AuditPage() {
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => api('/api/audit'),
  });

  if (audit.isLoading) return <p className="text-muted">Loading the audit log…</p>;
  if (audit.error) return <p className="text-danger">{audit.error.message}</p>;
  const events = audit.data?.data || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-muted">Changes to incidents, maintenance, keys, and integrations.</p>
      </div>
      <Panel>
        {events.length === 0 ? (
          <Empty title="No audit events yet" body="Creating or resolving an incident writes the first row." />
        ) : (
          <ul>
            {events.map((event) => (
              <li key={event.id} className="border-b border-line px-4 py-3 last:border-0">
                <p>{event.message}</p>
                <p className="mt-1 font-mono text-xs text-muted">{event.actorName} · {formatWhen(event.createdAt)} · {event.action}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

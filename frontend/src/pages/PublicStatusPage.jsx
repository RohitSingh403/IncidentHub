import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatWhen } from '../lib/format';

const TONE = {
  operational: 'bg-signal',
  degraded: 'bg-warn',
  monitoring: 'bg-warn',
  unknown: 'bg-muted',
  outage: 'bg-danger',
  investigating: 'bg-danger',
  identified: 'bg-danger',
};

export function PublicStatusPage() {
  const { slug } = useParams();
  const status = useQuery({
    queryKey: ['public-status', slug],
    queryFn: () => api(`/api/public/status/${slug}`),
    refetchInterval: 10000,
  });
  const page = status.data?.data;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      {status.isLoading ? <p className="text-muted">Loading status…</p> : null}
      {status.error ? <p className="text-danger">{status.error.message}</p> : null}
      {page ? (
        <div className="space-y-8">
          <header>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-signal">Status</p>
            <h1 className="mt-2 text-4xl font-semibold">{page.name}</h1>
            {page.description ? <p className="mt-2 text-muted">{page.description}</p> : null}
            <p className="mt-6 text-2xl font-semibold">{page.summary}</p>
          </header>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {page.components.map((component) => (
              <li key={component.id} className="flex items-center justify-between px-4 py-3">
                <span>{component.name}</span>
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${TONE[component.status] || 'bg-muted'}`} />
                  {component.label}
                </span>
              </li>
            ))}
          </ul>
          <section>
            <h2 className="text-lg font-semibold">Current incidents</h2>
            {page.active.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing is being reported.</p> : null}
            <div className="mt-3 space-y-4">
              {page.active.map((incident) => (
                <article key={incident.id} className="rounded-xl border border-line p-4">
                  <h3 className="font-medium">{incident.title}</h3>
                  <p className="mt-1 text-sm text-muted">{incident.label} · since {formatWhen(incident.startedAt)}</p>
                  <ol className="mt-3 space-y-2 text-sm">
                    {incident.updates.map((update, index) => (
                      <li key={index}>
                        <span className="text-muted">{formatWhen(update.createdAt)} · {update.label}</span>
                        <p>{update.message}</p>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">History</h2>
            {page.history.length === 0 ? <p className="mt-2 text-sm text-muted">No past incidents on this page.</p> : null}
            <ul className="mt-3 space-y-2 text-sm">
              {page.history.map((incident) => (
                <li key={incident.id} className="flex items-center justify-between gap-4">
                  <span>{incident.title}</span>
                  <span className="text-muted">
                    {formatWhen(incident.startedAt)}
                    {incident.durationMinutes === 0 ? ' · <1 min' : ` · ${incident.durationMinutes} min`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </main>
  );
}

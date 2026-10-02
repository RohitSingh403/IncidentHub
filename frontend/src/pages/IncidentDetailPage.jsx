import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TRANSITION_LABELS, can, formatWhen } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Panel, SeverityBadge, inputClass } from '../components/ui';

export function IncidentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const incidentQuery = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api(`/api/incidents/${id}`),
    refetchInterval: 10000,
  });
  const incident = incidentQuery.data?.data;
  const postmortemQuery = useQuery({
    queryKey: ['incident-postmortem', id],
    queryFn: () => api(`/api/incidents/${id}/postmortem`),
    enabled: incident?.status === 'RESOLVED',
    retry: false,
  });
  const createPostmortem = useMutation({
    mutationFn: () => api(`/api/incidents/${id}/postmortem`, { method: 'POST' }),
    onSuccess: (result) => navigate(`/postmortems/${result.data.id}`),
    onError: (err) => setError(err.message),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['incident', id] });
    queryClient.invalidateQueries({ queryKey: ['incidents'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const transition = useMutation({
    mutationFn: (status) => api(`/api/incidents/${id}/transition`, { method: 'POST', body: { status } }),
    onSuccess: () => {
      setError('');
      refresh();
    },
    onError: (err) => setError(err.message),
  });

  const addComment = useMutation({
    mutationFn: () => api(`/api/incidents/${id}/comments`, { method: 'POST', body: { content: comment, visibility: 'internal' } }),
    onSuccess: () => {
      setComment('');
      setError('');
      refresh();
    },
    onError: (err) => setError(err.message),
  });

  if (incidentQuery.isLoading) return <p className="text-muted">Loading incident…</p>;
  if (incidentQuery.error) return <p className="text-danger">{incidentQuery.error.message}</p>;
  if (!incident) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs text-muted">{incident.number} · {incident.source}</p>
        <h1 className="mt-1 text-3xl font-semibold">{incident.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SeverityBadge severity={incident.severity} />
          <span className="font-mono text-sm">{incident.status}</span>
          {Number.isInteger(incident.escalationStep) ? (
            <span className="text-sm text-muted">Escalation step {incident.escalationStep + 1}</span>
          ) : null}
          {incident.service ? <Link className="text-sm text-signal" to={`/services/${incident.service.id}`}>{incident.service.name}</Link> : null}
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">{incident.description}</p>
        <dl className="mt-4 grid gap-3 font-mono text-xs text-muted sm:grid-cols-3">
          <div><dt>Detected</dt><dd className="text-ink">{formatWhen(incident.detectedAt)}</dd></div>
          <div><dt>Acknowledged</dt><dd className="text-ink">{formatWhen(incident.acknowledgedAt)}</dd></div>
          <div><dt>Resolved</dt><dd className="text-ink">{formatWhen(incident.resolvedAt)}</dd></div>
        </dl>
      </div>
      <Banner>{error}</Banner>
      {incident.status === 'RESOLVED' && postmortemQuery.data?.data ? (
        <Link className="text-sm text-signal" to={`/postmortems/${postmortemQuery.data.data.id}`}>Open postmortem</Link>
      ) : null}
      {incident.status === 'RESOLVED' && postmortemQuery.error?.status === 404 && can(user, 'postmortem:write') ? (
        <Button disabled={createPostmortem.isPending} onClick={() => createPostmortem.mutate()}>Write postmortem</Button>
      ) : null}
      {can(user, 'incident:transition') ? (
        <div className="flex flex-wrap gap-2">
          {(incident.allowedTransitions || []).map((status) => (
            <Button
              key={status}
              variant={status === 'RESOLVED' ? 'danger' : 'ghost'}
              disabled={transition.isPending}
              onClick={() => transition.mutate(status)}
            >
              {TRANSITION_LABELS[status] || status}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="border-b border-line px-4 py-3"><h2 className="font-medium">Timeline</h2></div>
          <ol className="space-y-4 px-4 py-4">
            {(incident.timeline || []).map((event) => (
              <li key={event.id} className="border-l border-line pl-4">
                <p className="font-mono text-[11px] text-muted">{formatWhen(event.createdAt)}</p>
                <p className="text-sm">{event.message}</p>
                {event.actor ? <p className="text-xs text-muted">{event.actor.name}</p> : null}
              </li>
            ))}
          </ol>
        </Panel>
        <Panel>
          <div className="border-b border-line px-4 py-3"><h2 className="font-medium">Internal notes</h2></div>
          <ul className="space-y-3 px-4 py-4">
            {(incident.comments || []).length === 0 ? <li className="text-sm text-muted">No notes yet.</li> : null}
            {(incident.comments || []).map((item) => (
              <li key={item.id}>
                <p className="text-sm">{item.content}</p>
                <p className="font-mono text-[11px] text-muted">{item.author?.name} · {formatWhen(item.createdAt)}</p>
              </li>
            ))}
          </ul>
          {can(user, 'incident:comment') ? (
            <form
              className="space-y-3 border-t border-line px-4 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (comment.trim()) addComment.mutate();
              }}
            >
              <textarea className={inputClass} rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What are you seeing?" />
              <Button type="submit" disabled={addComment.isPending}>Add note</Button>
            </form>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

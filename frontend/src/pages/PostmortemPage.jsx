import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { can, formatWhen } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Field, Panel, inputClass } from '../components/ui';

const FIELDS = [
  ['summary', 'Summary'],
  ['impact', 'Impact'],
  ['timeline', 'Timeline'],
  ['rootCause', 'Root cause'],
  ['contributingFactors', 'Contributing factors'],
  ['resolution', 'Resolution'],
  ['lessonsLearned', 'Lessons learned'],
];

export function PostmortemsPage() {
  const list = useQuery({ queryKey: ['postmortems'], queryFn: () => api('/api/postmortems') });
  const rows = list.data?.data || [];
  if (list.isLoading) return <p className="text-muted">Loading postmortems…</p>;
  if (list.error) return <p className="text-danger">{list.error.message}</p>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Postmortems</h1>
        <p className="mt-1 text-sm text-muted">Written after an incident is resolved, with actions that have an owner.</p>
      </div>
      {rows.length === 0 ? <Panel className="p-4 text-sm text-muted">No postmortems yet. Resolve an incident, then write one from its page.</Panel> : null}
      <ul className="space-y-2">
        {rows.map((item) => (
          <li key={item.id}>
            <Link to={`/postmortems/${item.id}`} className="block rounded-xl border border-line bg-panel px-4 py-3 hover:bg-panel-2">
              <span className="font-mono text-xs text-muted">{item.incidentNumber}</span>
              <span className="mt-1 block font-medium">{item.incidentTitle}</span>
              <span className="text-sm text-muted">{item.actions.filter((action) => action.status === 'pending').length} open actions</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PostmortemDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const detail = useQuery({ queryKey: ['postmortem', id], queryFn: () => api(`/api/postmortems/${id}`) });
  const postmortem = detail.data?.data;

  useEffect(() => {
    if (postmortem) setDraft({
      summary: postmortem.summary,
      impact: postmortem.impact,
      timeline: postmortem.timeline,
      rootCause: postmortem.rootCause,
      contributingFactors: postmortem.contributingFactors,
      resolution: postmortem.resolution,
      lessonsLearned: postmortem.lessonsLearned,
    });
  }, [postmortem]);

  const save = useMutation({
    mutationFn: () => api(`/api/postmortems/${id}`, { method: 'PATCH', body: draft }),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['postmortem', id] });
      queryClient.invalidateQueries({ queryKey: ['postmortems'] });
    },
    onError: (err) => setError(err.message),
  });
  const addAction = useMutation({
    mutationFn: () => api(`/api/postmortems/${id}/actions`, { method: 'POST', body: { title, ownerId: user.id } }),
    onSuccess: () => {
      setTitle('');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['postmortem', id] });
    },
    onError: (err) => setError(err.message),
  });
  const setStatus = useMutation({
    mutationFn: ({ actionId, status }) => api(`/api/postmortems/${id}/actions/${actionId}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['postmortem', id] }),
    onError: (err) => setError(err.message),
  });

  if (detail.isLoading || !draft) return <p className="text-muted">Loading postmortem…</p>;
  if (detail.error) return <p className="text-danger">{detail.error.message}</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link className="font-mono text-xs text-signal" to={`/incidents/${postmortem.incidentId}`}>{postmortem.incidentNumber}</Link>
        <h1 className="mt-1 text-3xl font-semibold">{postmortem.incidentTitle}</h1>
      </div>
      <Banner>{error}</Banner>
      <Panel className="space-y-4 p-4">
        {FIELDS.map(([key, label]) => (
          <Field key={key} label={label}>
            <textarea
              className={inputClass}
              rows={key === 'timeline' ? 6 : 3}
              value={draft[key]}
              disabled={!can(user, 'postmortem:write')}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </Field>
        ))}
        {can(user, 'postmortem:write') ? <Button disabled={save.isPending} onClick={() => save.mutate()}>Save postmortem</Button> : null}
      </Panel>
      <Panel className="p-4">
        <h2 className="font-medium">Actions</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {postmortem.actions.length === 0 ? <li className="text-muted">No actions yet.</li> : null}
          {postmortem.actions.map((action) => (
            <li key={action.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{action.title} <span className="text-muted">{action.ownerName || 'Unassigned'}{action.dueAt ? ` · due ${formatWhen(action.dueAt)}` : ''}</span></span>
              {can(user, 'postmortem:write') ? (
                <Button variant="ghost" onClick={() => setStatus.mutate({ actionId: action.id, status: action.status === 'done' ? 'pending' : 'done' })}>
                  {action.status === 'done' ? 'Reopen' : 'Mark done'}
                </Button>
              ) : <span className="font-mono text-xs text-muted">{action.status}</span>}
            </li>
          ))}
        </ul>
        {can(user, 'postmortem:write') ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Increase the connection pool" />
            <Button disabled={!title.trim() || addAction.isPending} onClick={() => addAction.mutate()}>Add action</Button>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted">New actions are assigned to you.</p>
      </Panel>
    </div>
  );
}

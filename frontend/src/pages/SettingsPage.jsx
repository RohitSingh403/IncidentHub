import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { can } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Field, Panel, inputClass } from '../components/ui';

export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const organization = useQuery({ queryKey: ['organization'], queryFn: () => api('/api/organization') });
  const members = useQuery({ queryKey: ['members'], queryFn: () => api('/api/members') });
  const [form, setForm] = useState(null);
  const [member, setMember] = useState({ name: '', email: '', password: '', role: 'engineer' });
  const org = organization.data?.data;
  const draft = form || (org ? { name: org.name, timezone: org.timezone, defaultSeverity: org.defaultSeverity } : null);

  const save = useMutation({
    mutationFn: () => api('/api/organization', { method: 'PATCH', body: draft }),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setError(err.message),
  });
  const addMember = useMutation({
    mutationFn: () => api('/api/members', { method: 'POST', body: member }),
    onSuccess: () => {
      setMember({ name: '', email: '', password: '', role: 'engineer' });
      setError('');
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => api(`/api/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
    onError: (err) => setError(err.message),
  });

  if (organization.error) return <p className="text-danger">{organization.error.message}</p>;
  if (!draft) return <p className="text-muted">Loading settings…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Organization profile, members, and the free-plan limits.</p>
      </div>
      <Banner>{error}</Banner>
      <Panel className="grid max-w-xl gap-3 p-4">
        <Field label="Company name">
          <input className={inputClass} value={draft.name} disabled={!can(user, 'org:update')} onChange={(event) => setForm({ ...draft, name: event.target.value })} />
        </Field>
        <Field label="Timezone">
          <input className={inputClass} value={draft.timezone} disabled={!can(user, 'org:update')} onChange={(event) => setForm({ ...draft, timezone: event.target.value })} />
        </Field>
        <Field label="Default severity">
          <select className={inputClass} value={draft.defaultSeverity} disabled={!can(user, 'org:update')} onChange={(event) => setForm({ ...draft, defaultSeverity: event.target.value })}>
            {['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'].map((severity) => <option key={severity}>{severity}</option>)}
          </select>
        </Field>
        {can(user, 'org:update') ? <Button onClick={() => save.mutate()} disabled={save.isPending}>Save organization</Button> : null}
      </Panel>
      <Panel className="p-4">
        <h2 className="font-medium">Members</h2>
        <ul className="mt-3 divide-y divide-line">
          {(members.data?.data || []).map((person) => (
            <li key={person.id} className="flex items-center justify-between py-3 text-sm">
              <span>{person.name} <span className="text-muted">{person.email}</span></span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted">{person.role}</span>
                {can(user, 'member:manage') && person.role !== 'owner' ? (
                  <button className="text-xs text-danger" onClick={() => remove.mutate(person.id)}>Remove</button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {can(user, 'member:manage') ? (
          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              addMember.mutate();
            }}
          >
            <Field label="Name"><input className={inputClass} value={member.name} onChange={(event) => setMember({ ...member, name: event.target.value })} /></Field>
            <Field label="Email"><input className={inputClass} value={member.email} onChange={(event) => setMember({ ...member, email: event.target.value })} /></Field>
            <Field label="Password"><input className={inputClass} type="password" value={member.password} onChange={(event) => setMember({ ...member, password: event.target.value })} /></Field>
            <Field label="Role">
              <select className={inputClass} value={member.role} onChange={(event) => setMember({ ...member, role: event.target.value })}>
                <option value="admin">Admin</option>
                <option value="incident_manager">Incident manager</option>
                <option value="engineer">Engineer</option>
                <option value="viewer">Viewer</option>
              </select>
            </Field>
            <Button type="submit" disabled={addMember.isPending}>Add member</Button>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}

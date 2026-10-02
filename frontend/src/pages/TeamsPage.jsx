import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { can } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Empty, Field, Panel, inputClass } from '../components/ui';

export function TeamsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api('/api/teams') });
  const members = useQuery({ queryKey: ['members'], queryFn: () => api('/api/members') });
  const create = useMutation({
    mutationFn: () => api('/api/teams', { method: 'POST', body: { name, description: '' } }),
    onSuccess: () => {
      setName('');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setError(err.message),
  });
  const addMember = useMutation({
    mutationFn: ({ teamId, userId }) => api(`/api/teams/${teamId}/members`, { method: 'POST', body: { userId } }),
    onSuccess: () => {
      setMemberUserId('');
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
    onError: (err) => setError(err.message),
  });

  const rows = teams.data?.data || [];
  const people = members.data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Teams</h1>
        <p className="mt-1 text-sm text-muted">The free plan includes one team. On-call rotations come after this loop is solid.</p>
      </div>
      <Banner>{error}</Banner>
      {can(user, 'team:write') ? (
        <Panel className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Team name">
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create team</Button>
        </Panel>
      ) : null}
      {rows.length === 0 ? <Panel><Empty title="No team yet" body="Create Engineering, then add the people who should see its incidents." /></Panel> : null}
      {rows.map((team) => (
        <Panel key={team.id} className="p-4">
          <h2 className="text-xl font-semibold">{team.name}</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {team.members.length === 0 ? <li className="text-muted">No members yet.</li> : null}
            {team.members.map((member) => (
              <li key={member.id}>{member.name} <span className="text-muted">{member.email}</span></li>
            ))}
          </ul>
          {can(user, 'team:write') ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <select className={inputClass} value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}>
                <option value="">Add a member</option>
                {people.map((person) => (
                  <option key={person.userId} value={person.userId}>{person.name}</option>
                ))}
              </select>
              <Button
                variant="ghost"
                disabled={!memberUserId}
                onClick={() => addMember.mutate({ teamId: team.id, userId: memberUserId })}
              >
                Add
              </Button>
            </div>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { can } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Empty, Field, Panel, inputClass } from '../components/ui';

export function OnCallPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({
    teamId: '',
    name: 'Primary',
    rotation: 'daily',
    memberIds: [],
  });
  const [override, setOverride] = useState({ scheduleId: '', userId: '', startsAt: '', endsAt: '' });

  const schedules = useQuery({ queryKey: ['oncall'], queryFn: () => api('/api/on-call/schedules') });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api('/api/teams') });
  const members = useQuery({ queryKey: ['members'], queryFn: () => api('/api/members') });

  const create = useMutation({
    mutationFn: () => api('/api/on-call/schedules', {
      method: 'POST',
      body: {
        ...draft,
        timezone: user?.organization?.timezone || 'UTC',
        startDate: new Date().toISOString(),
        handoffMinutes: 0,
      },
    }),
    onSuccess: () => {
      setError('');
      setDraft((current) => ({ ...current, memberIds: [] }));
      queryClient.invalidateQueries({ queryKey: ['oncall'] });
    },
    onError: (err) => setError(err.message),
  });

  const addOverride = useMutation({
    mutationFn: () => api(`/api/on-call/schedules/${override.scheduleId}/overrides`, {
      method: 'POST',
      body: {
        userId: override.userId,
        startsAt: new Date(override.startsAt).toISOString(),
        endsAt: new Date(override.endsAt).toISOString(),
      },
    }),
    onSuccess: () => {
      setError('');
      setOverride({ scheduleId: '', userId: '', startsAt: '', endsAt: '' });
      queryClient.invalidateQueries({ queryKey: ['oncall'] });
    },
    onError: (err) => setError(err.message),
  });

  const rows = schedules.data?.data || [];
  const people = members.data?.data || [];
  const teamRows = teams.data?.data || [];

  function toggleMember(userId) {
    setDraft((current) => ({
      ...current,
      memberIds: current.memberIds.includes(userId)
        ? current.memberIds.filter((id) => id !== userId)
        : [...current.memberIds, userId],
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">On-call</h1>
        <p className="mt-1 text-sm text-muted">One daily or weekly rotation per team. An override replaces the rotation until it ends.</p>
      </div>
      <Banner>{error}</Banner>
      {can(user, 'oncall:write') ? (
        <Panel className="space-y-4 p-4">
          <div className="flex flex-wrap gap-3">
            <Field label="Team">
              <select className={inputClass} value={draft.teamId} onChange={(event) => setDraft({ ...draft, teamId: event.target.value })}>
                <option value="">Choose a team</option>
                {teamRows.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </Field>
            <Field label="Name">
              <input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Rotation">
              <select className={inputClass} value={draft.rotation} onChange={(event) => setDraft({ ...draft, rotation: event.target.value })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {people.map((person) => (
              <label key={person.userId} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.memberIds.includes(person.userId)}
                  onChange={() => toggleMember(person.userId)}
                />
                {person.name}
              </label>
            ))}
          </div>
          <Button
            disabled={!draft.teamId || !draft.name.trim() || draft.memberIds.length === 0 || create.isPending}
            onClick={() => create.mutate()}
          >
            Create schedule
          </Button>
        </Panel>
      ) : null}
      {rows.length === 0 ? (
        <Panel><Empty title="No schedule yet" body="Create a rotation so new incidents know who to page." /></Panel>
      ) : null}
      {rows.map((schedule) => (
        <Panel key={schedule.id} className="p-4">
          <h2 className="text-xl font-semibold">{schedule.name}</h2>
          <p className="mt-1 text-sm text-muted">{schedule.teamName} · {schedule.rotation} · {schedule.timezone}</p>
          <p className="mt-3 text-sm">
            Current on-call: <span className="font-medium">{schedule.current?.name || 'Nobody scheduled'}</span>
          </p>
          {schedule.overrides?.length ? (
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {schedule.overrides.map((item) => (
                <li key={item.id}>Override {new Date(item.startsAt).toLocaleString()} – {new Date(item.endsAt).toLocaleString()}</li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ))}
      {can(user, 'oncall:write') && rows.length ? (
        <Panel className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Schedule">
            <select className={inputClass} value={override.scheduleId} onChange={(event) => setOverride({ ...override, scheduleId: event.target.value })}>
              <option value="">Choose</option>
              {rows.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.name}</option>)}
            </select>
          </Field>
          <Field label="Person">
            <select className={inputClass} value={override.userId} onChange={(event) => setOverride({ ...override, userId: event.target.value })}>
              <option value="">Choose</option>
              {people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
            </select>
          </Field>
          <Field label="Starts">
            <input className={inputClass} type="datetime-local" value={override.startsAt} onChange={(event) => setOverride({ ...override, startsAt: event.target.value })} />
          </Field>
          <Field label="Ends">
            <input className={inputClass} type="datetime-local" value={override.endsAt} onChange={(event) => setOverride({ ...override, endsAt: event.target.value })} />
          </Field>
          <Button
            variant="ghost"
            disabled={!override.scheduleId || !override.userId || !override.startsAt || !override.endsAt || addOverride.isPending}
            onClick={() => addOverride.mutate()}
          >
            Add override
          </Button>
        </Panel>
      ) : null}
    </div>
  );
}

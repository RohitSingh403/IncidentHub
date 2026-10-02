import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { can } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Empty, Field, Panel, inputClass } from '../components/ui';

const TARGETS = [
  ['on_call', 'On-call engineer'],
  ['team_manager', 'Team manager'],
  ['incident_manager', 'Incident manager'],
  ['user', 'Specific person'],
];

export function EscalationPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [name, setName] = useState('Default');
  const [teamId, setTeamId] = useState('');
  const [steps, setSteps] = useState([
    { target: 'on_call', waitMinutes: 5, userId: '' },
    { target: 'team_manager', waitMinutes: 10, userId: '' },
  ]);

  const policies = useQuery({ queryKey: ['policies'], queryFn: () => api('/api/escalation-policies') });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api('/api/teams') });
  const members = useQuery({ queryKey: ['members'], queryFn: () => api('/api/members') });

  const create = useMutation({
    mutationFn: () => api('/api/escalation-policies', {
      method: 'POST',
      body: {
        name,
        teamId: teamId || null,
        steps: steps.map((step) => ({
          target: step.target,
          waitMinutes: Number(step.waitMinutes),
          userId: step.target === 'user' ? step.userId : null,
        })),
      },
    }),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
    onError: (err) => setError(err.message),
  });

  const rows = policies.data?.data || [];
  const people = members.data?.data || [];
  const needsUser = steps.some((step) => step.target === 'user' && !step.userId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Escalation</h1>
        <p className="mt-1 text-sm text-muted">A policy pages the next step only while the incident is still open.</p>
      </div>
      <Banner>{error}</Banner>
      {can(user, 'escalation:write') ? (
        <Panel className="space-y-4 p-4">
          <div className="flex flex-wrap gap-3">
            <Field label="Name">
              <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Scope">
              <select className={inputClass} value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                <option value="">Organization default</option>
                {(teams.data?.data || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </Field>
          </div>
          {steps.map((step, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3">
              <Field label={`Step ${index + 1}`}>
                <select
                  className={inputClass}
                  value={step.target}
                  onChange={(event) => setSteps(steps.map((item, itemIndex) => itemIndex === index ? { ...item, target: event.target.value } : item))}
                >
                  {TARGETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              {step.target === 'user' ? (
                <Field label="Person">
                  <select
                    className={inputClass}
                    value={step.userId}
                    onChange={(event) => setSteps(steps.map((item, itemIndex) => itemIndex === index ? { ...item, userId: event.target.value } : item))}
                  >
                    <option value="">Choose</option>
                    {people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
                  </select>
                </Field>
              ) : null}
              <Field label="Wait, minutes">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={step.waitMinutes}
                  onChange={(event) => setSteps(steps.map((item, itemIndex) => itemIndex === index ? { ...item, waitMinutes: event.target.value } : item))}
                />
              </Field>
            </div>
          ))}
          <Button disabled={!name.trim() || needsUser || create.isPending} onClick={() => create.mutate()}>
            Create policy
          </Button>
        </Panel>
      ) : null}
      {rows.length === 0 ? (
        <Panel><Empty title="No policy yet" body="Without a policy, new incidents still notify the team, but they do not escalate." /></Panel>
      ) : (
        rows.map((policy) => (
          <Panel key={policy.id} className="p-4">
            <h2 className="text-xl font-semibold">{policy.name}</h2>
            <p className="mt-1 text-sm text-muted">{policy.teamName || 'Organization default'}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              {policy.steps.map((step, index) => (
                <li key={index}>{step.target.replaceAll('_', ' ')} · wait {step.waitMinutes} min</li>
              ))}
            </ol>
          </Panel>
        ))
      )}
    </div>
  );
}

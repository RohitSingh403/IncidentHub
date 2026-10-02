import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../lib/api';
import { can, timeAgo } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Empty, Field, Panel, SeverityBadge, StatusBadge, inputClass } from '../components/ui';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  serviceId: z.string().min(1, 'Choose a service'),
  severity: z.enum(['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4']),
  description: z.string().optional(),
});

export function IncidentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ search: '', severity: '', status: '', sort: 'newest' });
  const [error, setError] = useState('');
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const incidents = useQuery({
    queryKey: ['incidents', filters],
    queryFn: () => api(`/api/incidents?${params.toString()}`),
    refetchInterval: 10000,
  });
  const services = useQuery({ queryKey: ['services'], queryFn: () => api('/api/services') });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { severity: 'SEV-2' },
  });
  const create = useMutation({
    mutationFn: (values) =>
      api('/api/incidents', {
        method: 'POST',
        body: { ...values, description: values.description || '' },
      }),
    onSuccess: () => {
      setError('');
      form.reset({ severity: 'SEV-2', title: '', description: '', serviceId: '' });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => setError(err.message),
  });

  const rows = incidents.data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Incidents</h1>
        <p className="mt-1 text-sm text-muted">Monitor-created incidents stay unique per service until they are resolved.</p>
      </div>
      <Panel className="grid gap-3 p-4 md:grid-cols-4">
        <input className={inputClass} placeholder="Search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        <select className={inputClass} value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value })}>
          <option value="">All severities</option>
          {['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'].map((severity) => <option key={severity}>{severity}</option>)}
        </select>
        <select className={inputClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">All statuses</option>
          {['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'].map((status) => <option key={status}>{status}</option>)}
        </select>
        <select className={inputClass} value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="severity">Severity</option>
          <option value="duration">Duration</option>
        </select>
      </Panel>
      {can(user, 'incident:create') ? (
        <Panel className="p-4">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
            <div className="md:col-span-2"><Banner>{error}</Banner></div>
            <Field label="Title" error={form.formState.errors.title?.message}>
              <input className={inputClass} {...form.register('title')} />
            </Field>
            <Field label="Service" error={form.formState.errors.serviceId?.message}>
              <select className={inputClass} {...form.register('serviceId')}>
                <option value="">Select</option>
                {(services.data?.data || []).map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select className={inputClass} {...form.register('severity')}>
                {['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'].map((severity) => <option key={severity}>{severity}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <input className={inputClass} {...form.register('description')} />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" disabled={create.isPending}>Create incident</Button>
            </div>
          </form>
        </Panel>
      ) : null}
      <Panel>
        {rows.length === 0 ? <Empty title="No incidents" body="Nothing matches these filters." /> : (
          <ul>
            {rows.map((incident) => (
              <li key={incident.id} className="border-b border-line last:border-0">
                <Link to={`/incidents/${incident.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-panel-2">
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
    </div>
  );
}

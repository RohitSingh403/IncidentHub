import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../lib/api';
import { can } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Empty, Field, Panel, StatusDot, inputClass } from '../components/ui';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  url: z.string().trim().url('Enter a full URL, including https://'),
  environment: z.enum(['production', 'staging', 'development']),
  criticality: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().optional(),
});

export function ServicesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => api('/api/services'),
    refetchInterval: 10000,
  });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      environment: 'production',
      criticality: 'high',
      url: 'http://127.0.0.1:4000/api/demo/probe',
    },
  });
  const create = useMutation({
    mutationFn: (values) =>
      api('/api/services', {
        method: 'POST',
        body: { ...values, description: values.description || '', monitoringEnabled: true },
      }),
    onSuccess: () => {
      setError('');
      form.reset({ environment: 'production', criticality: 'high', url: 'http://127.0.0.1:4000/api/demo/probe', name: '' });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setError(err.message),
  });

  const rows = services.data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Services</h1>
        <p className="mt-1 text-sm text-muted">Each service gets one HTTP monitor. A single failure does not open an incident.</p>
      </div>
      {can(user, 'service:write') ? (
        <Panel className="p-4">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
            <div className="md:col-span-2">
              <Banner>{error}</Banner>
            </div>
            <Field label="Name" error={form.formState.errors.name?.message}>
              <input className={inputClass} {...form.register('name')} />
            </Field>
            <Field label="URL" error={form.formState.errors.url?.message}>
              <input className={inputClass} {...form.register('url')} />
            </Field>
            <Field label="Environment">
              <select className={inputClass} {...form.register('environment')}>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </Field>
            <Field label="Criticality">
              <select className={inputClass} {...form.register('criticality')}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" disabled={create.isPending}>Add service</Button>
            </div>
          </form>
        </Panel>
      ) : null}
      <Panel>
        {rows.length === 0 ? (
          <Empty title="No services" body="Add Payment API or point a monitor at the local demo probe." />
        ) : (
          <ul>
            {rows.map((service) => (
              <li key={service.id} className="border-b border-line last:border-0">
                <Link to={`/services/${service.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-panel-2">
                  <span className="flex items-center gap-3">
                    <StatusDot status={service.status} />
                    <span>
                      <span className="block">{service.name}</span>
                      <span className="font-mono text-xs text-muted">{service.environment} · {service.criticality}</span>
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {service.monitor?.lastResponseTimeMs != null ? `${service.monitor.lastResponseTimeMs}ms` : 'no checks'}
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

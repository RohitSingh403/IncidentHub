import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { can } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Empty, Field, Panel, inputClass } from '../components/ui';

export function StatusAdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('We have identified the cause and are working on a fix.');
  const pages = useQuery({ queryKey: ['status-pages'], queryFn: () => api('/api/status-pages') });
  const services = useQuery({ queryKey: ['services'], queryFn: () => api('/api/services') });

  const create = useMutation({
    mutationFn: () => api('/api/status-pages', { method: 'POST', body: { name, description: '' } }),
    onSuccess: () => {
      setName('');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['status-pages'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setError(err.message),
  });

  const addComponent = useMutation({
    mutationFn: ({ pageId, serviceId }) => api(`/api/status-pages/${pageId}/components`, {
      method: 'POST',
      body: { serviceId },
    }),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['status-pages'] });
    },
    onError: (err) => setError(err.message),
  });

  const postUpdate = useMutation({
    mutationFn: ({ incidentId, publicStatus }) => api(`/api/status-pages/incidents/${incidentId}/updates`, {
      method: 'POST',
      body: { publicStatus, message },
    }),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['status-pages'] });
    },
    onError: (err) => setError(err.message),
  });

  const rows = pages.data?.data || [];
  const serviceRows = services.data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Status page</h1>
        <p className="mt-1 text-sm text-muted">Customers see investigating, identified, monitoring, and resolved. They do not see the internal incident state.</p>
      </div>
      <Banner>{error}</Banner>
      {can(user, 'status:write') && rows.length === 0 ? (
        <Panel className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Page name">
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create status page</Button>
        </Panel>
      ) : null}
      {rows.length === 0 ? <Panel><Empty title="No public page" body="Create one page, then choose which services customers can see." /></Panel> : null}
      {rows.map((page) => (
        <Panel key={page.id} className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{page.name}</h2>
              <p className="text-sm text-muted">{page.summary}</p>
            </div>
            <Link className="text-sm text-signal" to={`/status/${page.slug}`}>View public page</Link>
          </div>
          <ul className="space-y-1 text-sm">
            {page.components.length === 0 ? <li className="text-muted">No components yet.</li> : null}
            {page.components.map((component) => (
              <li key={component.id}>{component.name} · {component.label}</li>
            ))}
          </ul>
          {can(user, 'status:write') ? (
            <div className="flex flex-wrap gap-2">
              <select
                className={inputClass}
                defaultValue=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  addComponent.mutate({ pageId: page.id, serviceId: event.target.value });
                  event.target.value = '';
                }}
              >
                <option value="">Add a service</option>
                {serviceRows.map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          {page.active.map((incident) => (
            <div key={incident.id} className="rounded-md border border-line p-3">
              <p className="font-medium">{incident.title}</p>
              <p className="text-sm text-muted">{incident.label}</p>
              {can(user, 'status:write') ? (
                <div className="mt-3 space-y-2">
                  <input className={inputClass} value={message} onChange={(event) => setMessage(event.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {['identified', 'monitoring', 'resolved'].map((publicStatus) => (
                      <Button
                        key={publicStatus}
                        variant="ghost"
                        disabled={postUpdate.isPending}
                        onClick={() => postUpdate.mutate({ incidentId: incident.id, publicStatus })}
                      >
                        {publicStatus}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </Panel>
      ))}
    </div>
  );
}

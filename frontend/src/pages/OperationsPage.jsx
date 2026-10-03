import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { can, formatWhen } from '../lib/format';
import { Banner, Button, Field, Panel, inputClass } from '../components/ui';

export function OperationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createdKey, setCreatedKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const writable = can(user, 'operations:write');
  const operations = useQuery({
    queryKey: ['operations'],
    queryFn: () => api('/api/operations'),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['operations'] });
  }

  const maintenance = useMutation({
    mutationFn: (body) => api('/api/operations/maintenance', { method: 'POST', body }),
    onSuccess: () => { setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const slo = useMutation({
    mutationFn: (body) => api('/api/operations/slos', { method: 'PUT', body }),
    onSuccess: () => { setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const runbook = useMutation({
    mutationFn: (body) => api('/api/operations/runbooks', { method: 'PUT', body }),
    onSuccess: () => { setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const dependency = useMutation({
    mutationFn: (body) => api('/api/operations/dependencies', { method: 'PUT', body }),
    onSuccess: () => { setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const apiKey = useMutation({
    mutationFn: (body) => api('/api/operations/api-keys', { method: 'POST', body }),
    onSuccess: (result) => { setCreatedKey(result.data.key); setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const revoke = useMutation({
    mutationFn: (id) => api(`/api/operations/api-keys/${id}/revoke`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const webhook = useMutation({
    mutationFn: (body) => api('/api/operations/webhooks', { method: 'POST', body }),
    onSuccess: (result) => { setWebhookSecret(result.data.secret); setError(''); refresh(); },
    onError: (err) => setError(err.message),
  });
  const integrations = useMutation({
    mutationFn: (body) => api('/api/operations/integrations', { method: 'PATCH', body }),
    onSuccess: (result) => {
      setError('');
      const connected = [
        result.data?.slack ? 'Slack is connected' : '',
        result.data?.github ? 'GitHub is connected' : '',
      ].filter(Boolean);
      setNotice(connected.length ? `Saved. ${connected.join('. ')}.` : 'Saved.');
      refresh();
    },
    onError: (err) => { setNotice(''); setError(err.message); },
  });
  const checkout = useMutation({
    mutationFn: (plan) => api('/api/operations/checkout', { method: 'POST', body: { plan } }),
    onSuccess: (result) => { window.location.assign(result.data.url); },
    onError: (err) => setError(err.message),
  });

  if (operations.isLoading) return <p className="text-muted">Loading operations…</p>;
  if (operations.error) return <p className="text-danger">{operations.error.message}</p>;
  const data = operations.data.data;
  const services = data.services || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Operations</h1>
        <p className="mt-1 text-sm text-muted">
          Plan {data.integrations.plan}. Email {data.integrations.email.replace('_', ' ')}. Slack {data.integrations.slack ? 'connected' : 'not connected'}. GitHub {data.integrations.github ? 'connected' : 'not connected'}. Model summary {data.integrations.ai.replace('_', ' ')}.
        </p>
      </div>
      <Banner>{error}</Banner>
      {createdKey ? <p className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm">Copy this API key now. It will not be shown again: {createdKey}</p> : null}
      {webhookSecret ? <p className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-sm">Copy this webhook secret now. It will not be shown again: {webhookSecret}</p> : null}

      <Panel className="space-y-3 px-4 py-4">
        <h2 className="font-medium">Maintenance</h2>
        <p className="text-sm text-muted">Checks still run. A window stops a new incident from opening.</p>
        {writable ? (
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            maintenance.mutate({
              serviceId: form.get('serviceId'),
              startsAt: new Date(form.get('startsAt')).toISOString(),
              endsAt: new Date(form.get('endsAt')).toISOString(),
              reason: form.get('reason'),
            });
            event.currentTarget.reset();
          }}>
            <Field label="Service">
              <select className={inputClass} name="serviceId" required>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </Field>
            <Field label="Starts">
              <input className={inputClass} name="startsAt" type="datetime-local" required />
            </Field>
            <Field label="Ends">
              <input className={inputClass} name="endsAt" type="datetime-local" required />
            </Field>
            <Field label="Reason">
              <input className={inputClass} name="reason" placeholder="Deploy window" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Schedule</Button>
            </div>
          </form>
        ) : null}
        <ul className="text-sm">
          {data.maintenance.map((window) => (
            <li key={window.id} className="border-t border-line py-2">
              {window.serviceName} · {formatWhen(window.startsAt)} to {formatWhen(window.endsAt)} {window.active ? '· active' : ''} {window.reason}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="space-y-3 px-4 py-4">
        <h2 className="font-medium">SLOs and error budget</h2>
        {writable ? (
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            slo.mutate({
              serviceId: form.get('serviceId'),
              targetPercent: Number(form.get('targetPercent')),
              windowDays: Number(form.get('windowDays')),
            });
          }}>
            <Field label="Service">
              <select className={inputClass} name="serviceId" required>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </Field>
            <Field label="Target percent">
              <input className={inputClass} name="targetPercent" type="number" min="90" max="100" step="0.1" defaultValue="99.9" />
            </Field>
            <Field label="Window, days">
              <input className={inputClass} name="windowDays" type="number" min="1" max="90" defaultValue="30" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Save SLO</Button>
            </div>
          </form>
        ) : null}
        <ul className="text-sm">
          {data.slos.map((item) => (
            <li key={item.serviceId} className="border-t border-line py-2">
              {item.serviceName} · target {item.targetPercent}% / {item.windowDays}d
              {item.actualPercent == null ? ' · no checks in the window' : ` · actual ${item.actualPercent.toFixed(2)}% · budget left ${item.remainingPercent.toFixed(0)}%`}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="space-y-3 px-4 py-4">
        <h2 className="font-medium">Runbooks and dependencies</h2>
        {writable ? (
          <form className="grid gap-3" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            runbook.mutate({ serviceId: form.get('serviceId'), title: form.get('title'), body: form.get('body') });
          }}>
            <div className="grid gap-3 md:grid-cols-2">
              <select className={inputClass} name="serviceId" required>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
              <input className={inputClass} name="title" placeholder="Runbook title" required />
            </div>
            <textarea className={inputClass} name="body" rows={4} placeholder="What to check first" />
            <Button type="submit">Save runbook</Button>
          </form>
        ) : null}
        <ul className="text-sm">
          {data.runbooks.map((item) => (
            <li key={item.serviceId} className="border-t border-line py-2"><span className="font-medium">{item.title}</span> · {item.serviceName}<p className="text-muted">{item.body}</p></li>
          ))}
        </ul>
        {writable ? (
          <form className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const dependsOn = form.getAll('dependsOn').filter(Boolean);
            dependency.mutate({ serviceId: form.get('serviceId'), dependsOn });
          }}>
            <Field label="Service">
              <select className={inputClass} name="serviceId" required>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </Field>
            <Field label="Depends on">
              <select className={`${inputClass} min-h-24`} name="dependsOn" multiple>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </Field>
            <Button type="submit">Save dependencies</Button>
          </form>
        ) : null}
        <ul className="text-sm">
          {services.filter((service) => service.dependsOn.length).map((service) => (
            <li key={service.id}>{service.name} depends on {service.dependsOn.map((item) => item.name).join(', ')}</li>
          ))}
        </ul>
      </Panel>

      <Panel className="space-y-3 px-4 py-4">
        <h2 className="font-medium">API keys and webhooks</h2>
        {writable ? (
          <form className="flex gap-3" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            apiKey.mutate({ name: form.get('name') });
            event.currentTarget.reset();
          }}>
            <input className={inputClass} name="name" placeholder="Key name" required />
            <Button type="submit">Create key</Button>
          </form>
        ) : null}
        <ul className="text-sm">
          {data.apiKeys.map((key) => (
            <li key={key.id} className="flex items-center justify-between border-t border-line py-2">
              <span>{key.name} · {key.prefix}… {key.revokedAt ? 'revoked' : ''}</span>
              {writable && !key.revokedAt ? <Button variant="ghost" onClick={() => revoke.mutate(key.id)}>Revoke</Button> : null}
            </li>
          ))}
        </ul>
        {writable ? (
          <form className="flex gap-3" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            webhook.mutate({ url: form.get('url') });
            event.currentTarget.reset();
          }}>
            <input className={inputClass} name="url" placeholder="https://example.com/hooks/incidenthub" required />
            <Button type="submit">Add webhook</Button>
          </form>
        ) : null}
        <ul className="text-sm">
          {data.webhooks.map((hook) => <li key={hook.id} className="border-t border-line py-2">{hook.url}</li>)}
        </ul>
      </Panel>

      <Panel className="space-y-3 px-4 py-4">
        <h2 className="font-medium">Slack, GitHub, and billing</h2>
        <p className="text-sm text-muted">Slack and GitHub send when an incident opens. Email sends when SMTP is configured. A model summary is used on the incident brief only when an API key is configured. Otherwise the brief is taken from the timeline.</p>
        {writable ? (
          <form className="grid gap-3" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const slackWebhookUrl = String(form.get('slackWebhookUrl') || '').trim();
            const githubToken = String(form.get('githubToken') || '').trim();
            integrations.mutate({
              githubRepo: form.get('githubRepo'),
              ...(slackWebhookUrl ? { slackWebhookUrl } : {}),
              ...(githubToken ? { githubToken } : {}),
            });
          }}>
            <p className="text-sm text-signal">
              {data.integrations.slack ? 'Slack webhook is saved.' : 'Slack is not connected.'}{' '}
              {data.integrations.github ? 'GitHub token is saved.' : 'GitHub token is not saved.'}
            </p>
            <input className={inputClass} name="slackWebhookUrl" placeholder={data.integrations.slack ? 'Webhook saved. Paste a new URL only to replace it.' : 'Slack incoming webhook URL'} />
            <input className={inputClass} name="githubRepo" placeholder="owner/repository" defaultValue={data.integrations.githubRepo} />
            <input className={inputClass} name="githubToken" placeholder={data.integrations.github ? 'Token saved. Paste a new token only to replace it.' : 'GitHub token, stored for issue creation'} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={integrations.isPending}>{integrations.isPending ? 'Saving…' : 'Save integrations'}</Button>
              <Button type="button" variant="ghost" disabled={checkout.isPending} onClick={() => checkout.mutate('pro')}>Upgrade to Pro</Button>
              <Button type="button" variant="ghost" disabled={checkout.isPending} onClick={() => checkout.mutate('business')}>Upgrade to Business</Button>
              {notice ? <p className="text-sm text-signal">{notice}</p> : null}
            </div>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}

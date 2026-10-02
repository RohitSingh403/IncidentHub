import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { can, formatPercent, formatWhen } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Field, Panel, SeverityBadge, StatusDot, inputClass } from '../components/ui';

export function ServiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const serviceQuery = useQuery({
    queryKey: ['service', id],
    queryFn: () => api(`/api/services/${id}`),
    refetchInterval: 10000,
  });
  const service = serviceQuery.data?.data;
  const [monitor, setMonitor] = useState(null);

  useEffect(() => {
    setMonitor(null);
  }, [id]);

  useEffect(() => {
    if (!service?.monitor) return;
    setMonitor((current) => current ?? service.monitor);
  }, [service]);

  const save = useMutation({
    mutationFn: (body) => api(`/api/services/${id}/monitor`, { method: 'PUT', body }),
    onSuccess: () => {
      setError('');
      setNotice('Monitor saved.');
      queryClient.invalidateQueries({ queryKey: ['service', id] });
    },
    onError: (err) => setError(err.message),
  });

  const run = useMutation({
    mutationFn: () => api(`/api/services/${id}/monitor/run`, { method: 'POST' }),
    onSuccess: (result) => {
      const check = result.data.check;
      setNotice(check.success ? `Check passed in ${check.responseTimeMs}ms` : check.error || 'Check failed');
      queryClient.invalidateQueries({ queryKey: ['service', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => setError(err.message),
  });

  async function setProbe(mode) {
    setError('');
    await fetch('/api/demo/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    setNotice(mode === 'down' ? 'Local probe is returning HTTP 503.' : 'Local probe is healthy.');
  }

  if (serviceQuery.isLoading) return <p className="text-muted">Loading service…</p>;
  if (serviceQuery.error) return <p className="text-danger">{serviceQuery.error.message}</p>;
  if (!service || !monitor) return null;

  const writable = can(user, 'service:write');
  const isProbe = monitor.url.includes('/api/demo/probe');

  function update(field, value) {
    setMonitor((current) => ({ ...current, [field]: value }));
  }

  function onSave(event) {
    event.preventDefault();
    save.mutate({
      url: monitor.url,
      method: monitor.method,
      intervalSeconds: Number(monitor.intervalSeconds),
      timeoutMs: Number(monitor.timeoutMs),
      expectedStatus: Number(monitor.expectedStatus),
      expectedJsonPath: monitor.expectedJsonPath || '',
      expectedJsonValue: monitor.expectedJsonValue || '',
      failureThreshold: Number(monitor.failureThreshold),
      recoveryThreshold: Number(monitor.recoveryThreshold),
      latencyThresholdMs: Number(monitor.latencyThresholdMs),
      enabled: Boolean(monitor.enabled),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">{service.environment}</p>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-semibold">
            <StatusDot status={service.status} />
            {service.name}
          </h1>
          <p className="mt-2 text-sm text-muted">
            24h uptime {formatPercent(service.uptimePercent)} · avg {service.averageLatencyMs ?? '—'}ms · p95 {service.p95LatencyMs ?? '—'}ms
          </p>
        </div>
        {writable ? <Button onClick={() => run.mutate()} disabled={run.isPending}>Run check now</Button> : null}
      </div>
      <Banner>{error}</Banner>
      {notice ? <p className="text-sm text-signal">{notice}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel className="p-4">
          <h2 className="font-medium">Monitor</h2>
          <p className="mt-1 text-sm text-muted">
            An incident opens after {monitor.failureThreshold} failed {monitor.failureThreshold === 1 ? 'check' : 'checks'} and clears after {monitor.recoveryThreshold} successful {monitor.recoveryThreshold === 1 ? 'check' : 'checks'}.
          </p>
          <form className="mt-4 grid gap-3" onSubmit={onSave}>
            <Field label="URL">
              <input className={inputClass} value={monitor.url} onChange={(event) => update('url', event.target.value)} disabled={!writable} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Method">
                <select className={inputClass} value={monitor.method} onChange={(event) => update('method', event.target.value)} disabled={!writable}>
                  <option>GET</option>
                  <option>POST</option>
                </select>
              </Field>
              <Field label="Expected status">
                <input className={inputClass} type="number" value={monitor.expectedStatus} onChange={(event) => update('expectedStatus', event.target.value)} disabled={!writable} />
              </Field>
              <Field label="Interval (seconds)">
                <input className={inputClass} type="number" value={monitor.intervalSeconds} onChange={(event) => update('intervalSeconds', event.target.value)} disabled={!writable} />
              </Field>
              <Field label="Timeout (ms)">
                <input className={inputClass} type="number" value={monitor.timeoutMs} onChange={(event) => update('timeoutMs', event.target.value)} disabled={!writable} />
              </Field>
              <Field label="Failure threshold">
                <input className={inputClass} type="number" value={monitor.failureThreshold} onChange={(event) => update('failureThreshold', event.target.value)} disabled={!writable} />
              </Field>
              <Field label="Recovery threshold">
                <input className={inputClass} type="number" value={monitor.recoveryThreshold} onChange={(event) => update('recoveryThreshold', event.target.value)} disabled={!writable} />
              </Field>
              <Field label="Latency threshold (ms)">
                <input className={inputClass} type="number" value={monitor.latencyThresholdMs} onChange={(event) => update('latencyThresholdMs', event.target.value)} disabled={!writable} />
              </Field>
              <Field label="JSON path">
                <input className={inputClass} value={monitor.expectedJsonPath || ''} placeholder="status" onChange={(event) => update('expectedJsonPath', event.target.value)} disabled={!writable} />
              </Field>
            </div>
            <Field label="Expected JSON value">
              <input className={inputClass} value={monitor.expectedJsonValue || ''} placeholder="healthy" onChange={(event) => update('expectedJsonValue', event.target.value)} disabled={!writable} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={monitor.enabled} onChange={(event) => update('enabled', event.target.checked)} disabled={!writable} />
              Monitoring enabled
            </label>
            {writable ? <Button type="submit" disabled={save.isPending}>Save monitor</Button> : null}
          </form>
          {isProbe && writable ? (
            <div className="mt-4 flex gap-2">
              <Button variant="danger" type="button" onClick={() => setProbe('down')}>Simulate down</Button>
              <Button variant="ghost" type="button" onClick={() => setProbe('up')}>Simulate up</Button>
            </div>
          ) : null}
        </Panel>
        <div className="space-y-4">
          <Panel>
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-medium">Recent checks</h2>
            </div>
            <ul>
              {(service.recentChecks || []).length === 0 ? <li className="px-4 py-6 text-sm text-muted">No checks yet.</li> : null}
              {(service.recentChecks || []).map((check) => (
                <li key={check.id} className="flex items-center justify-between border-b border-line px-4 py-2 font-mono text-xs last:border-0">
                  <span className={check.success ? 'text-signal' : 'text-danger'}>
                    {check.success ? 'PASS' : 'FAIL'} {check.statusCode ?? '—'}
                  </span>
                  <span>{check.responseTimeMs ?? '—'}ms</span>
                  <span className="text-muted">{formatWhen(check.checkedAt)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-medium">Incidents</h2>
            </div>
            <ul>
              {(service.recentIncidents || []).map((incident) => (
                <li key={incident.id}>
                  <Link to={`/incidents/${incident.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-panel-2">
                    <span>{incident.number} · {incident.title}</span>
                    <SeverityBadge severity={incident.severity} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

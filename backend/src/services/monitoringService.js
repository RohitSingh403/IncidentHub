import { AppError } from '../utils/AppError.js';
import { enqueueMonitorCheck } from '../queues/index.js';
import { applyCheckResult } from '../domain/monitorState.js';
import { classifyResponse } from '../domain/classifyResponse.js';
import { HealthCheck, Monitor, Service } from '../models/index.js';
import { resolveMonitorIncident, syncMonitorIncident } from './incidentService.js';
import { maintenanceCovers } from './operationsService.js';

export async function executeHttpCheck(monitor) {
  const started = Date.now();
  try {
    const response = await fetch(monitor.url, {
      method: monitor.method,
      redirect: 'follow',
      signal: AbortSignal.timeout(monitor.timeoutMs),
    });
    const elapsedMs = Date.now() - started;
    const text = await response.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return classifyResponse({
      statusCode: response.status,
      body,
      elapsedMs,
      monitor,
    });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    return {
      success: false,
      statusCode: null,
      responseTimeMs: Date.now() - started,
      error: timedOut ? 'Timeout' : error.message,
    };
  }
}

export async function ingestCheck(monitorId, check) {
  const monitor = await Monitor.findById(monitorId);
  if (!monitor) throw new AppError('MONITOR_NOT_FOUND', 'Monitor does not exist', 404);

  const service = await Service.findById(monitor.serviceId);
  if (!service) {
    await Monitor.updateOne({ _id: monitor._id }, { $set: { enabled: false, lockedUntil: null } });
    throw new AppError('SERVICE_NOT_FOUND', 'Service does not exist', 404);
  }

  const decision = applyCheckResult(
    {
      consecutiveFailures: monitor.consecutiveFailures,
      consecutiveSuccesses: monitor.consecutiveSuccesses,
      consecutiveSlow: monitor.consecutiveSlow,
      failureThreshold: monitor.failureThreshold,
      recoveryThreshold: monitor.recoveryThreshold,
      latencyThresholdMs: monitor.latencyThresholdMs,
      serviceStatus: service.status,
    },
    check,
  );

  await HealthCheck.create({
    organizationId: monitor.organizationId,
    serviceId: monitor.serviceId,
    monitorId: monitor._id,
    statusCode: check.statusCode,
    responseTimeMs: check.responseTimeMs,
    success: check.success,
    error: check.error,
    checkedAt: new Date(),
  });

  await Monitor.updateOne(
    { _id: monitor._id },
    {
      $set: {
        consecutiveFailures: decision.consecutiveFailures,
        consecutiveSuccesses: decision.consecutiveSuccesses,
        consecutiveSlow: decision.consecutiveSlow,
        lastCheckAt: new Date(),
        lastStatusCode: check.statusCode,
        lastResponseTimeMs: check.responseTimeMs,
        lastError: check.error,
        lastSuccess: check.success,
      },
    },
  );

  service.status = decision.serviceStatus;
  await service.save();

  if ((decision.action === 'down' || decision.action === 'degraded')
    && !(await maintenanceCovers(service.organizationId, service._id))) {
    await syncMonitorIncident(service, decision.action, check);
  } else if (decision.action === 'healthy') {
    await resolveMonitorIncident(service, check);
  }

  return { decision, check };
}

export async function runMonitorNow(organizationId, serviceId) {
  const monitor = await Monitor.findOne({ organizationId, serviceId });
  if (!monitor) throw new AppError('MONITOR_NOT_FOUND', 'Monitor does not exist', 404);
  const check = await executeHttpCheck(monitor);
  const result = await ingestCheck(monitor._id, check);
  const intervalMs = Math.max(15, monitor.intervalSeconds) * 1000;
  await Monitor.updateOne(
    { _id: monitor._id },
    { $set: { lockedUntil: null, nextCheckAt: new Date(Date.now() + intervalMs) } },
  );
  return result;
}

export async function claimAndCheck(monitorId) {
  const now = new Date();
  const monitor = await Monitor.findOneAndUpdate(
    {
      _id: monitorId,
      enabled: true,
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + 30_000) } },
    { new: true },
  );
  if (!monitor) return false;

  try {
    const check = await executeHttpCheck(monitor);
    await ingestCheck(monitor._id, check);
  } finally {
    const intervalMs = Math.max(15, monitor.intervalSeconds) * 1000;
    await Monitor.updateOne(
      { _id: monitor._id },
      { $set: { lockedUntil: null, nextCheckAt: new Date(Date.now() + intervalMs) } },
    );
  }
  return true;
}

export async function enqueueDueMonitors() {
  const due = await Monitor.find({
    enabled: true,
    nextCheckAt: { $lte: new Date() },
  })
    .select('_id')
    .limit(100);
  for (const monitor of due) {
    await enqueueMonitorCheck(monitor._id);
  }
  return due.length;
}

export async function processDueMonitor() {
  const now = new Date();
  const monitor = await Monitor.findOneAndUpdate(
    {
      enabled: true,
      nextCheckAt: { $lte: now },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + 30_000) } },
    { sort: { nextCheckAt: 1 }, new: true },
  );

  if (!monitor) return false;

  try {
    const check = await executeHttpCheck(monitor);
    await ingestCheck(monitor._id, check);
  } finally {
    const intervalMs = Math.max(15, monitor.intervalSeconds) * 1000;
    await Monitor.updateOne(
      { _id: monitor._id },
      { $set: { lockedUntil: null, nextCheckAt: new Date(Date.now() + intervalMs) } },
    );
  }

  return true;
}

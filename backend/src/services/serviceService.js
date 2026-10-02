import { AppError } from '../utils/AppError.js';
import { limitFor } from '../domain/entitlements.js';
import { percentile, uptimePercent } from '../domain/metrics.js';
import { presentCheck, presentIncident, presentService } from '../utils/presenters.js';
import { allowedTransitions } from '../domain/incidentTransitions.js';
import { HealthCheck, Incident, Monitor, Organization, Service, Team } from '../models/index.js';
import { runMonitorNow } from './monitoringService.js';

async function assertTeam(organizationId, teamId) {
  if (!teamId) return null;
  const team = await Team.findById(teamId);
  if (!team) throw new AppError('TEAM_NOT_FOUND', 'Team does not exist', 404);
  if (String(team.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that team', 403);
  }
  return team;
}

async function serviceInOrg(organizationId, serviceId) {
  const service = await Service.findById(serviceId);
  if (!service) throw new AppError('SERVICE_NOT_FOUND', 'Service does not exist', 404);
  if (String(service.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that service', 403);
  }
  return service;
}

async function decorate(services) {
  if (!services.length) return [];
  const organizationId = services[0].organizationId;
  const [monitors, teams] = await Promise.all([
    Monitor.find({ serviceId: { $in: services.map((service) => service._id) } }),
    Team.find({
      organizationId,
      _id: { $in: services.map((service) => service.teamId).filter(Boolean) },
    }),
  ]);
  const monitorByService = new Map(monitors.map((monitor) => [String(monitor.serviceId), monitor]));
  const teamById = new Map(teams.map((team) => [String(team._id), team]));
  return services.map((service) =>
    presentService(
      service,
      monitorByService.get(String(service._id)),
      service.teamId ? teamById.get(String(service.teamId)) : null,
    ),
  );
}

export async function listServices(organizationId) {
  const services = await Service.find({ organizationId }).sort({ name: 1 });
  return decorate(services);
}

export async function createService(organizationId, input) {
  const organization = await Organization.findById(organizationId);
  const used = await Service.countDocuments({ organizationId });
  const max = limitFor(organization.plan, 'monitoring.services.max');
  if (used >= max) {
    throw new AppError('QUOTA_EXCEEDED', `Service limit reached (${used}/${max})`, 403);
  }

  await assertTeam(organizationId, input.teamId);
  const service = await Service.create({
    organizationId,
    name: input.name.trim(),
    description: input.description || '',
    environment: input.environment,
    url: input.url,
    teamId: input.teamId || null,
    criticality: input.criticality,
    monitoringEnabled: input.monitoringEnabled,
    status: 'unknown',
  });

  await Monitor.create({
    organizationId,
    serviceId: service._id,
    url: input.url,
    enabled: input.monitoringEnabled,
    nextCheckAt: new Date(),
  });

  const [presented] = await decorate([service]);
  return presented;
}

export async function getService(organizationId, serviceId) {
  const service = await serviceInOrg(organizationId, serviceId);
  const [presented] = await decorate([service]);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [checks, recentIncidents, window] = await Promise.all([
    HealthCheck.find({ organizationId, serviceId }).sort({ checkedAt: -1 }).limit(20),
    Incident.find({ organizationId, serviceId }).sort({ createdAt: -1 }).limit(8),
    HealthCheck.find({ organizationId, serviceId, checkedAt: { $gte: since } }).select(
      'success responseTimeMs',
    ),
  ]);

  const successful = window.filter((check) => check.success).length;
  const latencies = window
    .map((check) => check.responseTimeMs)
    .filter((value) => Number.isFinite(value));

  return {
    ...presented,
    uptimePercent: uptimePercent(successful, window.length),
    averageLatencyMs: latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null,
    p95LatencyMs: percentile(latencies, 95),
    recentChecks: checks.map(presentCheck),
    recentIncidents: recentIncidents.map((incident) =>
      presentIncident(incident, {
        service,
        allowedTransitions: allowedTransitions(incident.status),
      }),
    ),
  };
}

export async function updateService(organizationId, serviceId, input) {
  const service = await serviceInOrg(organizationId, serviceId);
  await assertTeam(organizationId, input.teamId);
  service.name = input.name.trim();
  service.description = input.description || '';
  service.environment = input.environment;
  service.url = input.url;
  service.teamId = input.teamId || null;
  service.criticality = input.criticality;
  service.monitoringEnabled = input.monitoringEnabled;
  await service.save();
  await Monitor.updateOne(
    { serviceId: service._id },
    { $set: { enabled: input.monitoringEnabled && service.monitoringEnabled } },
  );
  if (!input.monitoringEnabled) {
    await Monitor.updateOne({ serviceId: service._id }, { $set: { enabled: false } });
  }
  const [presented] = await decorate([service]);
  return presented;
}

export async function deleteService(organizationId, serviceId) {
  const service = await serviceInOrg(organizationId, serviceId);
  await Monitor.deleteOne({ serviceId: service._id });
  await service.deleteOne();
  return { removed: true };
}

export async function updateMonitor(organizationId, serviceId, input) {
  await serviceInOrg(organizationId, serviceId);
  const monitor = await Monitor.findOneAndUpdate(
    { organizationId, serviceId },
    {
      $set: {
        url: input.url,
        method: input.method,
        intervalSeconds: input.intervalSeconds,
        timeoutMs: input.timeoutMs,
        expectedStatus: input.expectedStatus,
        expectedJsonPath: input.expectedJsonPath || '',
        expectedJsonValue: input.expectedJsonValue || '',
        failureThreshold: input.failureThreshold,
        recoveryThreshold: input.recoveryThreshold,
        latencyThresholdMs: input.latencyThresholdMs,
        enabled: input.enabled,
      },
    },
    { new: true },
  );
  if (!monitor) throw new AppError('MONITOR_NOT_FOUND', 'Monitor does not exist', 404);
  const service = await Service.findById(serviceId);
  service.monitoringEnabled = input.enabled;
  await service.save();
  const [presented] = await decorate([service]);
  return presented;
}

export async function runServiceCheck(organizationId, serviceId) {
  await serviceInOrg(organizationId, serviceId);
  const result = await runMonitorNow(organizationId, serviceId);
  const detail = await getService(organizationId, serviceId);
  return { check: result.check, decision: result.decision, service: detail };
}

export async function listChecks(organizationId, serviceId) {
  await serviceInOrg(organizationId, serviceId);
  const checks = await HealthCheck.find({ organizationId, serviceId })
    .sort({ checkedAt: -1 })
    .limit(50);
  return checks.map(presentCheck);
}

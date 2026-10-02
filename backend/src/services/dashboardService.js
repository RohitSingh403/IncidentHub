import { meanMinutes, percentile, uptimePercent } from '../domain/metrics.js';
import { dailyTrend } from '../domain/operations.js';
import { OPEN_STATUSES } from '../domain/incidentTransitions.js';
import { presentIncident } from '../utils/presenters.js';
import { usageFor } from '../utils/presenters.js';
import { HealthCheck, Incident, Organization, Service } from '../models/index.js';
import { allowedTransitions } from '../domain/incidentTransitions.js';

export async function getDashboard(organizationId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const historySince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const organization = await Organization.findById(organizationId);

  const [services, openIncidents, checks, acknowledged, resolved, usage, recentIncidents, latencyChecks, failedChecks] = await Promise.all([
    Service.find({ organizationId }).sort({ name: 1 }),
    Incident.find({ organizationId, status: { $in: OPEN_STATUSES } }).sort({ createdAt: -1 }).limit(8),
    HealthCheck.aggregate([
      { $match: { organizationId: organization._id, checkedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          successful: { $sum: { $cond: ['$success', 1, 0] } },
        },
      },
    ]),
    Incident.find({
      organizationId,
      acknowledgedAt: { $ne: null },
      createdAt: { $gte: historySince },
    }).select('detectedAt acknowledgedAt'),
    Incident.find({
      organizationId,
      status: 'RESOLVED',
      resolvedAt: { $ne: null },
      createdAt: { $gte: historySince },
    }).select('detectedAt resolvedAt'),
    usageFor(organization),
    Incident.find({ organizationId, createdAt: { $gte: historySince } }).select('detectedAt serviceId createdAt'),
    HealthCheck.find({ organizationId, checkedAt: { $gte: since }, responseTimeMs: { $ne: null } }).select('responseTimeMs'),
    HealthCheck.find({ organizationId, success: false, checkedAt: { $gte: historySince } }).select('serviceId checkedAt'),
  ]);

  const checkSummary = checks[0] || { total: 0, successful: 0 };
  const names = new Map(services.map((service) => [String(service._id), service]));

  return {
    services: services.length,
    openIncidents: await Incident.countDocuments({
      organizationId,
      status: { $in: OPEN_STATUSES },
    }),
    uptimePercent: uptimePercent(checkSummary.successful, checkSummary.total),
    mttaMinutes: meanMinutes(
      acknowledged.map((incident) => ({ start: incident.detectedAt, end: incident.acknowledgedAt })),
    ),
    mttrMinutes: meanMinutes(
      resolved.map((incident) => ({ start: incident.detectedAt, end: incident.resolvedAt })),
    ),
    mttdMinutes: meanMinutes(recentIncidents.flatMap((incident) => {
      const detected = new Date(incident.detectedAt).getTime();
      const earlier = failedChecks
        .filter((check) => String(check.serviceId) === String(incident.serviceId))
        .map((check) => new Date(check.checkedAt).getTime())
        .filter((time) => time <= detected && detected - time <= 60 * 60 * 1000);
      if (!earlier.length) return [];
      return [{ start: new Date(Math.min(...earlier)), end: incident.detectedAt }];
    })),
    latencyP95Ms: percentile(latencyChecks.map((check) => check.responseTimeMs), 95),
    latencyP99Ms: percentile(latencyChecks.map((check) => check.responseTimeMs), 99),
    incidentTrend: dailyTrend(recentIncidents.map((incident) => incident.createdAt), 14),
    activeIncidents: openIncidents.map((incident) =>
      presentIncident(incident, {
        service: names.get(String(incident.serviceId)),
        allowedTransitions: allowedTransitions(incident.status),
      }),
    ),
    serviceHealth: services.map((service) => ({
      id: String(service._id),
      name: service.name,
      status: service.status,
      environment: service.environment,
      criticality: service.criticality,
    })),
    usage,
  };
}

import { permissionsFor } from '../domain/permissions.js';
import { limitFor } from '../domain/entitlements.js';
import { Membership, Service, StatusPage, Team } from '../models/index.js';

export function presentUser(user, membership, organization, usage) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: membership.role,
    permissions: permissionsFor(membership.role),
    organization: {
      id: String(organization._id),
      name: organization.name,
      slug: organization.slug,
      timezone: organization.timezone,
      plan: organization.plan,
      defaultSeverity: organization.defaultSeverity,
      usage,
    },
  };
}

export async function usageFor(organization) {
  const [services, teams, members, statusPages] = await Promise.all([
    Service.countDocuments({ organizationId: organization._id }),
    Team.countDocuments({ organizationId: organization._id }),
    Membership.countDocuments({ organizationId: organization._id }),
    StatusPage.countDocuments({ organizationId: organization._id }),
  ]);

  return {
    services: { used: services, max: limitFor(organization.plan, 'monitoring.services.max') },
    teams: { used: teams, max: limitFor(organization.plan, 'teams.max') },
    members: { used: members, max: limitFor(organization.plan, 'members.max') },
    statusPages: { used: statusPages, max: limitFor(organization.plan, 'statusPages.max') },
  };
}

export function presentMember(user, membership) {
  return {
    id: String(membership._id),
    userId: String(user._id),
    name: user.name,
    email: user.email,
    role: membership.role,
    createdAt: membership.createdAt,
  };
}

export function presentTeam(team, members = []) {
  return {
    id: String(team._id),
    name: team.name,
    description: team.description,
    managerId: team.managerId ? String(team.managerId) : null,
    members,
    createdAt: team.createdAt,
  };
}

export function presentMonitor(monitor) {
  if (!monitor) return null;
  return {
    id: String(monitor._id),
    url: monitor.url,
    method: monitor.method,
    intervalSeconds: monitor.intervalSeconds,
    timeoutMs: monitor.timeoutMs,
    expectedStatus: monitor.expectedStatus,
    expectedJsonPath: monitor.expectedJsonPath,
    expectedJsonValue: monitor.expectedJsonValue,
    failureThreshold: monitor.failureThreshold,
    recoveryThreshold: monitor.recoveryThreshold,
    latencyThresholdMs: monitor.latencyThresholdMs,
    enabled: monitor.enabled,
    consecutiveFailures: monitor.consecutiveFailures,
    consecutiveSuccesses: monitor.consecutiveSuccesses,
    lastCheckAt: monitor.lastCheckAt,
    lastStatusCode: monitor.lastStatusCode,
    lastResponseTimeMs: monitor.lastResponseTimeMs,
    lastError: monitor.lastError,
    lastSuccess: monitor.lastSuccess,
    nextCheckAt: monitor.nextCheckAt,
  };
}

export function presentService(service, monitor, team) {
  return {
    id: String(service._id),
    name: service.name,
    description: service.description,
    environment: service.environment,
    url: service.url,
    criticality: service.criticality,
    monitoringEnabled: service.monitoringEnabled,
    status: service.status,
    team: team ? { id: String(team._id), name: team.name } : null,
    monitor: presentMonitor(monitor),
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

export function incidentNumber(number) {
  return `INC-${number}`;
}

export function presentIncident(incident, extras = {}) {
  const service = incident.serviceId?.name ? incident.serviceId : extras.service;
  const team = incident.assignedTeamId?.name ? incident.assignedTeamId : extras.team;
  const assignee = incident.assignedUserId?.name ? incident.assignedUserId : extras.assignee;

  return {
    id: String(incident._id),
    number: incidentNumber(incident.number),
    title: incident.title,
    description: incident.description,
    severity: incident.severity,
    severityRank: incident.severityRank,
    status: incident.status,
    source: incident.source,
    trigger: incident.trigger,
    service: service?.name
      ? { id: String(service._id || service.id), name: service.name }
      : incident.serviceId
        ? { id: String(incident.serviceId), name: extras.serviceName || 'Service' }
        : null,
    assignedTeam: team?.name ? { id: String(team._id), name: team.name } : null,
    assignedUser: assignee?.name ? { id: String(assignee._id), name: assignee.name } : null,
    detectedAt: incident.detectedAt,
    acknowledgedAt: incident.acknowledgedAt,
    resolvedAt: incident.resolvedAt,
    escalationStep: incident.escalationStep,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    allowedTransitions: extras.allowedTransitions,
    timeline: extras.timeline,
    comments: extras.comments,
  };
}

export function presentCheck(check) {
  return {
    id: String(check._id),
    statusCode: check.statusCode,
    responseTimeMs: check.responseTimeMs,
    success: check.success,
    error: check.error,
    checkedAt: check.checkedAt,
  };
}

export function presentNotification(notification) {
  return {
    id: String(notification._id),
    title: notification.title,
    body: notification.body,
    channel: notification.channel,
    status: notification.status,
    incidentId: notification.incidentId ? String(notification.incidentId) : null,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

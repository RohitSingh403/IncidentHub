import { AppError } from '../utils/AppError.js';
import { allowedTransitions, canTransition, OPEN_STATUSES } from '../domain/incidentTransitions.js';
import { SEVERITY_RANK } from '../domain/severity.js';
import { severityForAvailability, severityForLatency } from '../domain/severity.js';
import { escapeRegex } from '../utils/slug.js';
import { presentIncident } from '../utils/presenters.js';
import {
  Incident,
  IncidentComment,
  IncidentEvent,
  Membership,
  Organization,
  Service,
  Team,
  User,
} from '../models/index.js';
import { notifyIncident } from './notificationService.js';
import { syncPublicIncident } from './statusPageService.js';

const OPEN_FILTER = { $in: OPEN_STATUSES };

function describeCheck(check) {
  const code = check.statusCode ?? 'no response';
  const latency = Number.isFinite(check.responseTimeMs) ? `${check.responseTimeMs}ms` : 'n/a';
  const error = check.error ? ` ${check.error}.` : '';
  return `Check result: HTTP ${code}, ${latency}.${error}`;
}

async function assertService(organizationId, serviceId) {
  const service = await Service.findById(serviceId);
  if (!service) throw new AppError('SERVICE_NOT_FOUND', 'Service does not exist', 404);
  if (String(service.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that service', 403);
  }
  return service;
}

async function assertTeam(organizationId, teamId) {
  if (!teamId) return null;
  const team = await Team.findById(teamId);
  if (!team || String(team.organizationId) !== String(organizationId)) {
    throw new AppError('TEAM_NOT_FOUND', 'Team does not exist in this organization', 400);
  }
  return team;
}

async function assertAssignee(organizationId, userId) {
  if (!userId) return null;
  const membership = await Membership.findOne({ organizationId, userId });
  if (!membership) {
    throw new AppError('MEMBER_NOT_FOUND', 'Assignee is not in this organization', 400);
  }
  return membership;
}

async function nextNumber(organizationId) {
  const organization = await Organization.findOneAndUpdate(
    { _id: organizationId },
    { $inc: { incidentCounter: 1 } },
    { new: true },
  );
  return organization.incidentCounter;
}

async function addEvent(incident, type, message, actorId, metadata = {}) {
  await IncidentEvent.create({
    organizationId: incident.organizationId,
    incidentId: incident._id,
    type,
    message,
    actorId: actorId || null,
    metadata,
  });
}

async function findOpenMonitorIncident(organizationId, serviceId) {
  return Incident.findOne({
    organizationId,
    serviceId,
    source: 'monitor',
    status: OPEN_FILTER,
  });
}

function durationMs(incident) {
  const end = incident.resolvedAt ? new Date(incident.resolvedAt) : new Date();
  return end.getTime() - new Date(incident.detectedAt).getTime();
}

async function loadNames(incidents) {
  const serviceIds = incidents.map((incident) => incident.serviceId);
  const teamIds = incidents.map((incident) => incident.assignedTeamId).filter(Boolean);
  const userIds = incidents.map((incident) => incident.assignedUserId).filter(Boolean);
  const [services, teams, users] = await Promise.all([
    Service.find({ _id: { $in: serviceIds } }),
    Team.find({ _id: { $in: teamIds } }),
    User.find({ _id: { $in: userIds } }),
  ]);
  return {
    services: new Map(services.map((service) => [String(service._id), service])),
    teams: new Map(teams.map((team) => [String(team._id), team])),
    users: new Map(users.map((user) => [String(user._id), user])),
  };
}

function presentWithNames(incident, names) {
  return presentIncident(incident, {
    service: names.services.get(String(incident.serviceId)),
    team: incident.assignedTeamId ? names.teams.get(String(incident.assignedTeamId)) : null,
    assignee: incident.assignedUserId ? names.users.get(String(incident.assignedUserId)) : null,
    allowedTransitions: allowedTransitions(incident.status),
  });
}

export async function listIncidents(organizationId, query) {
  const filter = { organizationId };
  if (query.status) filter.status = query.status;
  if (query.severity) filter.severity = query.severity;
  if (query.serviceId) filter.serviceId = query.serviceId;
  if (query.range === '30d') {
    filter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  }
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    const services = await Service.find({ organizationId, name: regex }).select('_id');
    filter.$or = [{ title: regex }, { serviceId: { $in: services.map((service) => service._id) } }];
  }

  const incidents = await Incident.find(filter).sort({ createdAt: -1 }).limit(100);
  const names = await loadNames(incidents);
  const rows = incidents.map((incident) => presentWithNames(incident, names));

  if (query.sort === 'oldest') {
    rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (query.sort === 'severity') {
    rows.sort((a, b) => a.severityRank - b.severityRank || new Date(b.createdAt) - new Date(a.createdAt));
  } else if (query.sort === 'duration') {
    const byId = new Map(incidents.map((incident) => [String(incident._id), incident]));
    rows.sort((a, b) => durationMs(byId.get(b.id)) - durationMs(byId.get(a.id)));
  }

  return rows;
}

async function incidentInOrg(organizationId, incidentId) {
  const incident = await Incident.findById(incidentId);
  if (!incident) throw new AppError('INCIDENT_NOT_FOUND', 'Incident does not exist', 404);
  if (String(incident.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that incident', 403);
  }
  return incident;
}

async function timelineFor(incident) {
  const events = await IncidentEvent.find({ incidentId: incident._id }).sort({ createdAt: 1 });
  const actors = await User.find({ _id: { $in: events.map((event) => event.actorId).filter(Boolean) } });
  const names = new Map(actors.map((user) => [String(user._id), user.name]));
  return events.map((event) => ({
    id: String(event._id),
    type: event.type,
    message: event.message,
    actor: event.actorId ? { id: String(event.actorId), name: names.get(String(event.actorId)) || 'User' } : null,
    createdAt: event.createdAt,
  }));
}

async function commentsFor(incident) {
  const comments = await IncidentComment.find({ incidentId: incident._id }).sort({ createdAt: 1 });
  const authors = await User.find({ _id: { $in: comments.map((comment) => comment.authorId) } });
  const names = new Map(authors.map((user) => [String(user._id), user]));
  return comments.map((comment) => {
    const author = names.get(String(comment.authorId));
    return {
      id: String(comment._id),
      content: comment.content,
      visibility: comment.visibility,
      author: { id: String(comment.authorId), name: author?.name || 'User' },
      createdAt: comment.createdAt,
    };
  });
}

export async function getIncident(organizationId, incidentId) {
  const incident = await incidentInOrg(organizationId, incidentId);
  const names = await loadNames([incident]);
  const presented = presentWithNames(incident, names);
  presented.timeline = await timelineFor(incident);
  presented.comments = await commentsFor(incident);
  return presented;
}

export async function createManualIncident(organizationId, actorId, input) {
  const service = await assertService(organizationId, input.serviceId);
  await assertTeam(organizationId, input.assignedTeamId);
  await assertAssignee(organizationId, input.assignedUserId);
  const organization = await Organization.findById(organizationId);
  const severity = input.severity || organization.defaultSeverity;
  const detectedAt = new Date();
  const incident = await Incident.create({
    organizationId,
    serviceId: service._id,
    number: await nextNumber(organizationId),
    title: input.title.trim(),
    description: input.description || '',
    severity,
    severityRank: SEVERITY_RANK[severity],
    status: 'OPEN',
    source: 'manual',
    trigger: 'manual',
    createdBy: actorId,
    assignedTeamId: input.assignedTeamId || service.teamId || null,
    assignedUserId: input.assignedUserId || null,
    detectedAt,
  });

  await addEvent(incident, 'incident.created', 'Incident created manually', actorId);
  await notifyIncident(incident, service, 'created');
  await syncPublicIncident(service, incident, 'down');
  return getIncident(organizationId, incident._id);
}

export async function updateIncident(organizationId, incidentId, actorId, input) {
  const incident = await incidentInOrg(organizationId, incidentId);
  if (incident.status === 'RESOLVED') {
    throw new AppError('INCIDENT_CLOSED', 'Resolved incidents cannot be edited', 409);
  }

  if (input.assignedTeamId !== undefined) await assertTeam(organizationId, input.assignedTeamId);
  if (input.assignedUserId !== undefined) await assertAssignee(organizationId, input.assignedUserId);

  const changes = [];
  if (input.title && input.title !== incident.title) {
    incident.title = input.title.trim();
    changes.push('title');
  }
  if (input.description !== undefined && input.description !== incident.description) {
    incident.description = input.description;
    changes.push('description');
  }
  if (input.severity && input.severity !== incident.severity) {
    incident.severity = input.severity;
    incident.severityRank = SEVERITY_RANK[input.severity];
    changes.push(`severity to ${input.severity}`);
  }
  if (input.assignedTeamId !== undefined && String(input.assignedTeamId || '') !== String(incident.assignedTeamId || '')) {
    incident.assignedTeamId = input.assignedTeamId || null;
    changes.push('team assignment');
  }
  if (input.assignedUserId !== undefined && String(input.assignedUserId || '') !== String(incident.assignedUserId || '')) {
    incident.assignedUserId = input.assignedUserId || null;
    changes.push('engineer assignment');
  }

  await incident.save();
  if (changes.length) {
    await addEvent(incident, 'incident.updated', `Updated ${changes.join(', ')}`, actorId);
  }
  return getIncident(organizationId, incident._id);
}

export async function transitionIncident(organizationId, incidentId, actorId, to) {
  const incident = await incidentInOrg(organizationId, incidentId);
  return applyTransition(incident, to, actorId, null);
}

export async function applyTransition(incident, to, actorId, message) {
  if (!canTransition(incident.status, to)) {
    throw new AppError(
      'INVALID_TRANSITION',
      `Cannot move from ${incident.status} to ${to}`,
      409,
    );
  }

  const from = incident.status;
  incident.status = to;
  if (to === 'ACKNOWLEDGED' && !incident.acknowledgedAt) {
    incident.acknowledgedAt = new Date();
    incident.acknowledgedBy = actorId;
  }
  if (to === 'RESOLVED') incident.resolvedAt = new Date();
  await incident.save();

  await addEvent(
    incident,
    'incident.transition',
    message || `Status changed from ${from} to ${to}`,
    actorId,
    { from, to },
  );

  if (to === 'RESOLVED') {
    const service = await Service.findById(incident.serviceId);
    await notifyIncident(incident, service, 'resolved');
    if (service) await syncPublicIncident(service, incident, 'resolved');
  }

  return getIncident(incident.organizationId, incident._id);
}

export async function addComment(organizationId, incidentId, actorId, input) {
  const incident = await incidentInOrg(organizationId, incidentId);
  const comment = await IncidentComment.create({
    organizationId,
    incidentId: incident._id,
    authorId: actorId,
    content: input.content.trim(),
    visibility: input.visibility || 'internal',
  });
  const author = await User.findById(actorId);
  await addEvent(
    incident,
    'incident.comment',
    `${author?.name || 'Someone'} commented`,
    actorId,
  );
  return {
    id: String(comment._id),
    content: comment.content,
    visibility: comment.visibility,
    author: { id: String(actorId), name: author?.name || 'User' },
    createdAt: comment.createdAt,
  };
}

export async function syncMonitorIncident(service, action, check) {
  const severity = action === 'down' ? severityForAvailability(service.criticality) : severityForLatency();
  const trigger = action === 'down' ? 'availability' : 'latency';
  const title = action === 'down' ? `${service.name} is down` : `${service.name} is degraded`;
  const description = describeCheck(check);

  let incident = await findOpenMonitorIncident(service.organizationId, service._id);
  if (!incident) {
    try {
      incident = await Incident.create({
        organizationId: service.organizationId,
        serviceId: service._id,
        number: await nextNumber(service.organizationId),
        title,
        description,
        severity,
        severityRank: SEVERITY_RANK[severity],
        status: 'OPEN',
        source: 'monitor',
        trigger,
        assignedTeamId: service.teamId || null,
        detectedAt: new Date(),
      });
      await addEvent(
        incident,
        'incident.created',
        `Failure threshold reached. ${description}`,
        null,
        { action, trigger },
      );
      await notifyIncident(incident, service, 'created');
      await syncPublicIncident(service, incident, action === 'degraded' ? 'degraded' : 'down');
      return incident;
    } catch (error) {
      if (error.code !== 11000) throw error;
      incident = await findOpenMonitorIncident(service.organizationId, service._id);
      if (!incident) throw error;
    }
  }

  if (incident.severity !== severity || incident.trigger !== trigger) {
    const previous = incident.severity;
    incident.severity = severity;
    incident.severityRank = SEVERITY_RANK[severity];
    incident.trigger = trigger;
    incident.title = title;
    incident.description = description;
    await incident.save();
    await addEvent(
      incident,
      'incident.updated',
      `Severity changed from ${previous} to ${severity}. ${description}`,
      null,
    );
    await notifyIncident(incident, service, 'updated');
  }

  return incident;
}

export async function resolveMonitorIncident(service, check) {
  const incident = await findOpenMonitorIncident(service.organizationId, service._id);
  if (!incident) return null;
  return applyTransition(
    incident,
    'RESOLVED',
    null,
    `Monitoring reached the recovery threshold. ${describeCheck(check)}`,
  );
}

import { AppError } from '../utils/AppError.js';
import { assertUnderLimit } from './retention.js';
import { incidentNumber } from '../utils/presenters.js';
import {
  Incident,
  IncidentEvent,
  Membership,
  Postmortem,
  PostmortemAction,
  User,
} from '../models/index.js';

async function incidentInOrg(organizationId, incidentId) {
  const incident = await Incident.findById(incidentId);
  if (!incident) throw new AppError('INCIDENT_NOT_FOUND', 'Incident does not exist', 404);
  if (String(incident.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that incident', 403);
  }
  return incident;
}

async function postmortemInOrg(organizationId, postmortemId) {
  const postmortem = await Postmortem.findById(postmortemId);
  if (!postmortem) throw new AppError('POSTMORTEM_NOT_FOUND', 'Postmortem does not exist', 404);
  if (String(postmortem.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that postmortem', 403);
  }
  return postmortem;
}

async function present(postmortem) {
  const [incident, actions] = await Promise.all([
    Incident.findById(postmortem.incidentId),
    PostmortemAction.find({ postmortemId: postmortem._id }).sort({ createdAt: 1 }),
  ]);
  const owners = await User.find({ _id: { $in: actions.map((action) => action.ownerId).filter(Boolean) } });
  const names = new Map(owners.map((user) => [String(user._id), user.name]));
  return {
    id: String(postmortem._id),
    incidentId: String(postmortem.incidentId),
    incidentNumber: incident ? incidentNumber(incident.number) : null,
    incidentTitle: incident?.title || 'Incident',
    summary: postmortem.summary,
    impact: postmortem.impact,
    timeline: postmortem.timeline,
    rootCause: postmortem.rootCause,
    contributingFactors: postmortem.contributingFactors,
    resolution: postmortem.resolution,
    lessonsLearned: postmortem.lessonsLearned,
    actions: actions.map((action) => ({
      id: String(action._id),
      title: action.title,
      ownerId: action.ownerId ? String(action.ownerId) : null,
      ownerName: action.ownerId ? names.get(String(action.ownerId)) || 'User' : null,
      dueAt: action.dueAt,
      status: action.status,
      completedAt: action.completedAt,
    })),
    createdAt: postmortem.createdAt,
    updatedAt: postmortem.updatedAt,
  };
}

export async function getForIncident(organizationId, incidentId) {
  await incidentInOrg(organizationId, incidentId);
  const postmortem = await Postmortem.findOne({ organizationId, incidentId });
  if (!postmortem) throw new AppError('POSTMORTEM_NOT_FOUND', 'This incident has no postmortem', 404);
  return present(postmortem);
}

export async function createForIncident(organizationId, incidentId, actorId) {
  const incident = await incidentInOrg(organizationId, incidentId);
  if (incident.status !== 'RESOLVED') {
    throw new AppError('INCIDENT_OPEN', 'Write the postmortem after the incident is resolved', 409);
  }
  const existing = await Postmortem.findOne({ organizationId, incidentId });
  if (existing) throw new AppError('POSTMORTEM_EXISTS', 'This incident already has a postmortem', 409);
  await assertUnderLimit(organizationId, 'postmortems.max', await Postmortem.countDocuments({ organizationId }));

  const events = await IncidentEvent.find({ incidentId }).sort({ createdAt: 1 });
  const timeline = events.map((event) => `${event.createdAt.toISOString()} ${event.message}`).join('\n');
  const postmortem = await Postmortem.create({
    organizationId,
    incidentId,
    timeline,
    resolution: incident.description || '',
    createdBy: actorId,
  });
  return present(postmortem);
}

export async function getPostmortem(organizationId, postmortemId) {
  return present(await postmortemInOrg(organizationId, postmortemId));
}

export async function listPostmortems(organizationId) {
  const postmortems = await Postmortem.find({ organizationId }).sort({ createdAt: -1 }).limit(50);
  const presented = [];
  for (const postmortem of postmortems) presented.push(await present(postmortem));
  return presented;
}

export async function updatePostmortem(organizationId, postmortemId, input) {
  const postmortem = await postmortemInOrg(organizationId, postmortemId);
  for (const field of ['summary', 'impact', 'timeline', 'rootCause', 'contributingFactors', 'resolution', 'lessonsLearned']) {
    if (input[field] !== undefined) postmortem[field] = input[field];
  }
  await postmortem.save();
  return present(postmortem);
}

async function assertOwner(organizationId, ownerId) {
  if (!ownerId) return;
  const membership = await Membership.findOne({ organizationId, userId: ownerId });
  if (!membership) throw new AppError('MEMBER_NOT_FOUND', 'The action owner must belong to this organization', 400);
}

export async function addAction(organizationId, postmortemId, input) {
  const postmortem = await postmortemInOrg(organizationId, postmortemId);
  await assertOwner(organizationId, input.ownerId);
  await PostmortemAction.create({
    organizationId,
    postmortemId: postmortem._id,
    title: input.title.trim(),
    ownerId: input.ownerId || null,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
  });
  return present(postmortem);
}

export async function updateAction(organizationId, postmortemId, actionId, input) {
  const postmortem = await postmortemInOrg(organizationId, postmortemId);
  const action = await PostmortemAction.findOne({ _id: actionId, postmortemId: postmortem._id });
  if (!action) throw new AppError('ACTION_NOT_FOUND', 'Action item does not exist', 404);
  if (input.ownerId !== undefined) {
    await assertOwner(organizationId, input.ownerId);
    action.ownerId = input.ownerId || null;
  }
  if (input.title) action.title = input.title.trim();
  if (input.dueAt !== undefined) action.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.status) {
    action.status = input.status;
    action.completedAt = input.status === 'done' ? action.completedAt || new Date() : null;
  }
  await action.save();
  return present(postmortem);
}

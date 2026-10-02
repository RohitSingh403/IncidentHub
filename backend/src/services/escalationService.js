import { AppError } from '../utils/AppError.js';
import { escalationDecision } from '../domain/escalation.js';
import { incidentNumber } from '../utils/presenters.js';
import { notifyIncident, notifyUsers } from './notificationService.js';
import { currentUserForSchedule } from './onCallService.js';
import { enqueueEscalation, cancelEscalation } from '../queues/index.js';
import {
  EscalationPolicy,
  Incident,
  IncidentEvent,
  Membership,
  OnCallSchedule,
  Team,
  User,
} from '../models/index.js';

const TARGET_LABELS = {
  on_call: 'on-call engineer',
  team_manager: 'team manager',
  incident_manager: 'incident manager',
  user: 'specific user',
};

async function recordEvent(incident, type, message, metadata = {}) {
  await IncidentEvent.create({
    organizationId: incident.organizationId,
    incidentId: incident._id,
    type,
    message,
    metadata,
  });
}

async function findPolicy(service) {
  if (service.teamId) {
    const teamPolicy = await EscalationPolicy.findOne({
      organizationId: service.organizationId,
      teamId: service.teamId,
    });
    if (teamPolicy) return teamPolicy;
  }
  return EscalationPolicy.findOne({ organizationId: service.organizationId, teamId: null });
}

async function usersForStep(step, { organizationId, teamId, now }) {
  if (step.target === 'user') return step.userId ? [step.userId] : [];
  if (step.target === 'on_call') {
    if (!teamId) return [];
    const schedule = await OnCallSchedule.findOne({ organizationId, teamId });
    if (!schedule) return [];
    const current = await currentUserForSchedule(schedule, now);
    return current.userId ? [current.userId] : [];
  }
  if (step.target === 'team_manager') {
    const team = teamId ? await Team.findById(teamId) : null;
    return team?.managerId ? [team.managerId] : [];
  }
  const managers = await Membership.find({ organizationId, role: 'incident_manager' });
  if (managers.length) return managers.map((membership) => membership.userId);
  const owners = await Membership.find({ organizationId, role: 'owner' });
  return owners.map((membership) => membership.userId);
}

async function namesFor(userIds) {
  const users = await User.find({ _id: { $in: userIds } });
  return users.map((user) => user.name);
}

async function scheduleFollowingStep(incident, policy, stepIndex) {
  const step = policy.steps[stepIndex];
  const hasNext = stepIndex + 1 < policy.steps.length;
  if (!hasNext || !step.waitMinutes) return;
  const jobId = await enqueueEscalation(incident._id, stepIndex, step.waitMinutes * 60 * 1000);
  if (jobId) {
    await Incident.updateOne({ _id: incident._id }, { $set: { escalationJobId: jobId } });
  }
}

export async function beginEscalation(incident, service) {
  const policy = await findPolicy(service);
  if (!policy?.steps?.length) {
    await notifyIncident(incident, service, 'created');
    return incident;
  }

  const users = await usersForStep(policy.steps[0], {
    organizationId: incident.organizationId,
    teamId: incident.assignedTeamId || service.teamId,
    now: new Date(),
  });
  incident.escalationPolicyId = policy._id;
  incident.escalationStep = 0;
  incident.assignedTeamId = incident.assignedTeamId || service.teamId || null;
  if (users[0]) incident.assignedUserId = users[0];
  await incident.save();

  const names = await namesFor(users);
  await recordEvent(
    incident,
    'escalation.started',
    names.length
      ? `Escalation step 1 notified ${names.join(', ')} (${TARGET_LABELS[policy.steps[0].target]})`
      : `Escalation step 1 found no ${TARGET_LABELS[policy.steps[0].target]}`,
    { step: 0 },
  );
  await notifyUsers(incident, users, {
    title: `${incidentNumber(incident.number)} opened`,
    body: `${incident.title} · ${incident.severity}`,
  });
  await scheduleFollowingStep(incident, policy, 0);
  return incident;
}

export async function advanceEscalation(incidentId) {
  const incident = await Incident.findById(incidentId);
  if (!incident) return { action: 'stop', reason: 'missing' };
  const policy = incident.escalationPolicyId
    ? await EscalationPolicy.findById(incident.escalationPolicyId)
    : null;
  const decision = escalationDecision({
    status: incident.status,
    currentStep: incident.escalationStep,
    stepCount: policy?.steps?.length || 0,
  });
  if (decision.action === 'stop') {
    if (incident.status !== 'OPEN') {
      await recordEvent(incident, 'escalation.stopped', 'Escalation stopped because the incident is no longer open');
    }
    return decision;
  }

  const claimed = await Incident.findOneAndUpdate(
    { _id: incident._id, status: 'OPEN', escalationStep: incident.escalationStep },
    { $set: { escalationStep: decision.stepIndex }, $inc: { escalationVersion: 1 } },
    { new: true },
  );
  if (!claimed) {
    return { action: 'stop', reason: 'race' };
  }

  const fresh = await Incident.findById(incident._id);
  if (fresh.status !== 'OPEN') {
    await recordEvent(fresh, 'escalation.stopped', 'Escalation stopped because the incident was acknowledged');
    return { action: 'stop', reason: 'acknowledged_or_closed' };
  }

  const step = policy.steps[decision.stepIndex];
  const users = await usersForStep(step, {
    organizationId: fresh.organizationId,
    teamId: fresh.assignedTeamId,
    now: new Date(),
  });
  if (users[0]) {
    await Incident.updateOne(
      { _id: fresh._id, status: 'OPEN' },
      { $set: { assignedUserId: users[0] } },
    );
  }
  const names = await namesFor(users);
  await recordEvent(
    fresh,
    'escalation.advanced',
    names.length
      ? `Escalation step ${decision.stepIndex + 1} notified ${names.join(', ')}`
      : `Escalation step ${decision.stepIndex + 1} found no recipient`,
    { step: decision.stepIndex },
  );
  await notifyUsers(fresh, users, {
    title: `${incidentNumber(fresh.number)} escalated`,
    body: `${fresh.title} · ${fresh.severity}`,
  });
  await scheduleFollowingStep(fresh, policy, decision.stepIndex);
  return { action: 'escalate', stepIndex: decision.stepIndex };
}

export async function stopEscalation(incident) {
  await cancelEscalation(incident.escalationJobId);
}

export function presentPolicy(policy, teamName = null) {
  return {
    id: String(policy._id),
    name: policy.name,
    teamId: policy.teamId ? String(policy.teamId) : null,
    teamName,
    steps: policy.steps.map((step) => ({
      target: step.target,
      userId: step.userId ? String(step.userId) : null,
      waitMinutes: step.waitMinutes,
    })),
  };
}

export async function listPolicies(organizationId) {
  const policies = await EscalationPolicy.find({ organizationId }).sort({ name: 1 });
  const teams = await Team.find({ _id: { $in: policies.map((policy) => policy.teamId).filter(Boolean) } });
  const names = new Map(teams.map((team) => [String(team._id), team.name]));
  return policies.map((policy) => presentPolicy(policy, policy.teamId ? names.get(String(policy.teamId)) : null));
}

export async function createPolicy(organizationId, input) {
  for (const step of input.steps) {
    if (step.target === 'user' && !step.userId) {
      throw new AppError('VALIDATION_ERROR', 'A user escalation step needs a user', 422);
    }
  }
  if (input.teamId) {
    const team = await Team.findById(input.teamId);
    if (!team || String(team.organizationId) !== String(organizationId)) {
      throw new AppError('TEAM_NOT_FOUND', 'Team does not exist in this organization', 404);
    }
  }
  const existing = await EscalationPolicy.findOne({
    organizationId,
    teamId: input.teamId || null,
  });
  if (existing) {
    throw new AppError('POLICY_EXISTS', 'An escalation policy already exists for that scope', 409);
  }
  const policy = await EscalationPolicy.create({
    organizationId,
    teamId: input.teamId || null,
    name: input.name.trim(),
    steps: input.steps.map((step) => ({
      target: step.target,
      userId: step.userId || null,
      waitMinutes: step.waitMinutes,
    })),
  });
  return presentPolicy(policy);
}

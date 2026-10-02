import { AppError } from '../utils/AppError.js';
import { resolveOnCall } from '../domain/onCall.js';
import { Membership, OnCallSchedule, ScheduleOverride, Team, User } from '../models/index.js';

async function assertMembers(organizationId, userIds) {
  const unique = [...new Set(userIds.map(String))];
  const memberships = await Membership.find({ organizationId, userId: { $in: unique } });
  if (memberships.length !== unique.length) {
    throw new AppError('MEMBER_NOT_FOUND', 'Every on-call user must belong to this organization', 400);
  }
}

async function assertTeam(organizationId, teamId) {
  const team = await Team.findById(teamId);
  if (!team || String(team.organizationId) !== String(organizationId)) {
    throw new AppError('TEAM_NOT_FOUND', 'Team does not exist in this organization', 404);
  }
  return team;
}

function presentSchedule(schedule, extras = {}) {
  return {
    id: String(schedule._id),
    teamId: String(schedule.teamId),
    teamName: extras.teamName || null,
    name: schedule.name,
    timezone: schedule.timezone,
    rotation: schedule.rotation,
    startDate: schedule.startDate,
    handoffMinutes: schedule.handoffMinutes,
    memberIds: schedule.memberIds.map(String),
    current: extras.current || null,
    overrides: extras.overrides || [],
  };
}

export async function currentUserForSchedule(schedule, now = new Date()) {
  const overrides = await ScheduleOverride.find({
    scheduleId: schedule._id,
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  });
  const decision = resolveOnCall({
    memberIds: schedule.memberIds,
    startDate: schedule.startDate,
    rotation: schedule.rotation,
    timeZone: schedule.timezone,
    handoffMinutes: schedule.handoffMinutes,
    now,
    overrides,
  });
  if (!decision.userId) return { ...decision, name: null };
  const user = await User.findById(decision.userId);
  return { ...decision, name: user?.name || null };
}

export async function listSchedules(organizationId) {
  const schedules = await OnCallSchedule.find({ organizationId }).sort({ name: 1 });
  const teams = await Team.find({ _id: { $in: schedules.map((schedule) => schedule.teamId) } });
  const names = new Map(teams.map((team) => [String(team._id), team.name]));
  const presented = [];
  for (const schedule of schedules) {
    const overrides = await ScheduleOverride.find({ scheduleId: schedule._id }).sort({ startsAt: 1 });
    const current = await currentUserForSchedule(schedule);
    presented.push(
      presentSchedule(schedule, {
        teamName: names.get(String(schedule.teamId)) || null,
        current,
        overrides: overrides.map((override) => ({
          id: String(override._id),
          userId: String(override.userId),
          startsAt: override.startsAt,
          endsAt: override.endsAt,
        })),
      }),
    );
  }
  return presented;
}

export async function createSchedule(organizationId, input) {
  await assertTeam(organizationId, input.teamId);
  await assertMembers(organizationId, input.memberIds);
  const existing = await OnCallSchedule.findOne({ organizationId, teamId: input.teamId });
  if (existing) {
    throw new AppError('SCHEDULE_EXISTS', 'This team already has an on-call schedule', 409);
  }
  const schedule = await OnCallSchedule.create({
    organizationId,
    teamId: input.teamId,
    name: input.name.trim(),
    timezone: input.timezone,
    rotation: input.rotation,
    startDate: new Date(input.startDate),
    handoffMinutes: input.handoffMinutes,
    memberIds: input.memberIds,
  });
  const schedules = await listSchedules(organizationId);
  return schedules.find((item) => item.id === String(schedule._id));
}

export async function createOverride(organizationId, scheduleId, input) {
  const schedule = await OnCallSchedule.findById(scheduleId);
  if (!schedule) throw new AppError('SCHEDULE_NOT_FOUND', 'Schedule does not exist', 404);
  if (String(schedule.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that schedule', 403);
  }
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(startsAt < endsAt)) {
    throw new AppError('VALIDATION_ERROR', 'Override end must be after the start', 422);
  }
  await assertMembers(organizationId, [input.userId]);
  await ScheduleOverride.create({
    organizationId,
    scheduleId: schedule._id,
    userId: input.userId,
    startsAt,
    endsAt,
  });
  const schedules = await listSchedules(organizationId);
  return schedules.find((item) => item.id === String(schedule._id));
}

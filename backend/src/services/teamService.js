import { AppError } from '../utils/AppError.js';
import { limitFor } from '../domain/entitlements.js';
import { presentTeam } from '../utils/presenters.js';
import { Membership, Organization, Service, Team, TeamMember, User } from '../models/index.js';

async function organizationOrThrow(organizationId) {
  const organization = await Organization.findById(organizationId);
  if (!organization) throw new AppError('ORG_NOT_FOUND', 'Organization does not exist', 404);
  return organization;
}

async function teamInOrg(organizationId, teamId) {
  const team = await Team.findById(teamId);
  if (!team) throw new AppError('TEAM_NOT_FOUND', 'Team does not exist', 404);
  if (String(team.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that team', 403);
  }
  return team;
}

async function assertOrgMember(organizationId, userId) {
  if (!userId) return;
  const membership = await Membership.findOne({ organizationId, userId });
  if (!membership) {
    throw new AppError('MEMBER_NOT_FOUND', 'That user is not in this organization', 400);
  }
}

async function membersForTeams(organizationId, teamIds) {
  const links = await TeamMember.find({ organizationId, teamId: { $in: teamIds } });
  const users = await User.find({ _id: { $in: links.map((link) => link.userId) } });
  const names = new Map(users.map((user) => [String(user._id), user]));
  const grouped = new Map();
  for (const link of links) {
    const user = names.get(String(link.userId));
    if (!user) continue;
    const key = String(link.teamId);
    const list = grouped.get(key) || [];
    list.push({ id: String(user._id), name: user.name, email: user.email });
    grouped.set(key, list);
  }
  return grouped;
}

export async function listTeams(organizationId) {
  const teams = await Team.find({ organizationId }).sort({ name: 1 });
  const grouped = await membersForTeams(
    organizationId,
    teams.map((team) => team._id),
  );
  return teams.map((team) => presentTeam(team, grouped.get(String(team._id)) || []));
}

export async function createTeam(organizationId, input) {
  const organization = await organizationOrThrow(organizationId);
  const used = await Team.countDocuments({ organizationId });
  const max = limitFor(organization.plan, 'teams.max');
  if (used >= max) {
    throw new AppError('QUOTA_EXCEEDED', `Team limit reached (${used}/${max})`, 403);
  }
  await assertOrgMember(organizationId, input.managerId);
  const team = await Team.create({
    organizationId,
    name: input.name.trim(),
    description: input.description || '',
    managerId: input.managerId || null,
  });
  if (input.managerId) {
    await TeamMember.create({ organizationId, teamId: team._id, userId: input.managerId });
  }
  return presentTeam(team, input.managerId ? await memberList(team) : []);
}

async function memberList(team) {
  const grouped = await membersForTeams(team.organizationId, [team._id]);
  return grouped.get(String(team._id)) || [];
}

export async function getTeam(organizationId, teamId) {
  const team = await teamInOrg(organizationId, teamId);
  return presentTeam(team, await memberList(team));
}

export async function updateTeam(organizationId, teamId, input) {
  const team = await teamInOrg(organizationId, teamId);
  await assertOrgMember(organizationId, input.managerId);
  team.name = input.name.trim();
  team.description = input.description || '';
  team.managerId = input.managerId || null;
  await team.save();
  if (input.managerId) {
    await TeamMember.updateOne(
      { teamId: team._id, userId: input.managerId },
      { $setOnInsert: { organizationId, teamId: team._id, userId: input.managerId } },
      { upsert: true },
    );
  }
  return presentTeam(team, await memberList(team));
}

export async function deleteTeam(organizationId, teamId) {
  const team = await teamInOrg(organizationId, teamId);
  await TeamMember.deleteMany({ teamId: team._id });
  await Service.updateMany({ organizationId, teamId: team._id }, { $set: { teamId: null } });
  await team.deleteOne();
  return { removed: true };
}

export async function addTeamMember(organizationId, teamId, userId) {
  const team = await teamInOrg(organizationId, teamId);
  await assertOrgMember(organizationId, userId);
  const existing = await TeamMember.findOne({ teamId: team._id, userId });
  if (!existing) {
    await TeamMember.create({ organizationId, teamId: team._id, userId });
  }
  return presentTeam(team, await memberList(team));
}

export async function removeTeamMember(organizationId, teamId, userId) {
  const team = await teamInOrg(organizationId, teamId);
  await TeamMember.deleteOne({ teamId: team._id, userId });
  if (team.managerId && String(team.managerId) === String(userId)) {
    team.managerId = null;
    await team.save();
  }
  return presentTeam(team, await memberList(team));
}

import { AppError } from '../utils/AppError.js';
import { hashPassword } from '../utils/password.js';
import { limitFor } from '../domain/entitlements.js';
import { presentMember, presentUser, usageFor } from '../utils/presenters.js';
import { Membership, Organization, User } from '../models/index.js';

async function assertMemberCapacity(organization) {
  const used = await Membership.countDocuments({ organizationId: organization._id });
  const max = limitFor(organization.plan, 'members.max');
  if (used >= max) {
    throw new AppError('QUOTA_EXCEEDED', `Member limit reached (${used}/${max})`, 403);
  }
}

export async function getOrganization(organizationId, user, membership) {
  const organization = await Organization.findById(organizationId);
  const usage = await usageFor(organization);
  return {
    id: String(organization._id),
    name: organization.name,
    slug: organization.slug,
    timezone: organization.timezone,
    plan: organization.plan,
    defaultSeverity: organization.defaultSeverity,
    usage,
    currentUser: presentUser(user, membership, organization, usage),
  };
}

export async function updateOrganization(organizationId, input) {
  const organization = await Organization.findByIdAndUpdate(
    organizationId,
    {
      name: input.name.trim(),
      timezone: input.timezone,
      defaultSeverity: input.defaultSeverity,
    },
    { new: true },
  );
  const usage = await usageFor(organization);
  return {
    id: String(organization._id),
    name: organization.name,
    slug: organization.slug,
    timezone: organization.timezone,
    plan: organization.plan,
    defaultSeverity: organization.defaultSeverity,
    usage,
  };
}

export async function listMembers(organizationId) {
  const memberships = await Membership.find({ organizationId }).sort({ createdAt: 1 });
  const users = await User.find({ _id: { $in: memberships.map((item) => item.userId) } });
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return memberships
    .map((membership) => {
      const user = byId.get(String(membership.userId));
      return user ? presentMember(user, membership) : null;
    })
    .filter(Boolean);
}

export async function addMember(organizationId, input) {
  const organization = await Organization.findById(organizationId);
  await assertMemberCapacity(organization);

  const email = input.email.toLowerCase().trim();
  let user = await User.findOne({ email });
  let createdUser = false;

  if (user) {
    const existing = await Membership.findOne({ userId: user._id });
    if (existing) {
      throw new AppError('EMAIL_IN_USE', 'That email already belongs to an organization', 409);
    }
  } else {
    user = await User.create({
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
    });
    createdUser = true;
  }

  try {
    const membership = await Membership.create({
      organizationId,
      userId: user._id,
      role: input.role,
    });
    return presentMember(user, membership);
  } catch (error) {
    if (createdUser) await User.deleteOne({ _id: user._id });
    throw error;
  }
}

export async function updateMemberRole(organizationId, membershipId, role) {
  const membership = await Membership.findById(membershipId);
  if (!membership) throw new AppError('MEMBER_NOT_FOUND', 'Member does not exist', 404);
  if (String(membership.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that member', 403);
  }
  if (membership.role === 'owner') {
    throw new AppError('FORBIDDEN', 'The owner role cannot be changed', 403);
  }

  membership.role = role;
  await membership.save();
  const user = await User.findById(membership.userId);
  return presentMember(user, membership);
}

export async function removeMember(organizationId, membershipId, actorId) {
  const membership = await Membership.findById(membershipId);
  if (!membership) throw new AppError('MEMBER_NOT_FOUND', 'Member does not exist', 404);
  if (String(membership.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that member', 403);
  }
  if (membership.role === 'owner') {
    throw new AppError('FORBIDDEN', 'The owner cannot be removed', 403);
  }
  if (String(membership.userId) === String(actorId) && membership.role === 'owner') {
    throw new AppError('FORBIDDEN', 'The owner cannot be removed', 403);
  }

  await membership.deleteOne();
  return { removed: true };
}

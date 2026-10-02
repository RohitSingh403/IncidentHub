import { AppError } from '../utils/AppError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/token.js';
import { slugify } from '../utils/slug.js';
import { presentUser, usageFor } from '../utils/presenters.js';
import { Membership, Organization, User } from '../models/index.js';

async function uniqueSlug(name) {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;
  while (await Organization.exists({ slug })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

async function sessionFor(user, membership, organization) {
  const usage = await usageFor(organization);
  const token = signToken({
    userId: String(user._id),
    organizationId: String(organization._id),
    role: membership.role,
  });
  return {
    token,
    user: presentUser(user, membership, organization, usage),
  };
}

export async function register({ name, email, password, organizationName }) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError('EMAIL_IN_USE', 'An account with that email already exists', 409);
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
  });

  let organization;
  try {
    organization = await Organization.create({
      name: organizationName.trim(),
      slug: await uniqueSlug(organizationName),
    });
    await Membership.create({
      organizationId: organization._id,
      userId: user._id,
      role: 'owner',
    });
  } catch (error) {
    if (organization) await Organization.deleteOne({ _id: organization._id });
    await User.deleteOne({ _id: user._id });
    throw error;
  }

  const membership = await Membership.findOne({
    userId: user._id,
    organizationId: organization._id,
  });
  return sessionFor(user, membership, organization);
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  const matches = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !matches) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const membership = await Membership.findOne({ userId: user._id });
  if (!membership) {
    throw new AppError('FORBIDDEN', 'You are not a member of an organization', 403);
  }

  const organization = await Organization.findById(membership.organizationId);
  if (!organization) {
    throw new AppError('FORBIDDEN', 'You are not a member of an organization', 403);
  }

  return sessionFor(user, membership, organization);
}

export async function currentSession(user, membership) {
  const organization = await Organization.findById(membership.organizationId);
  const usage = await usageFor(organization);
  return presentUser(user, membership, organization, usage);
}

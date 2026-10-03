import { AppError } from '../utils/AppError.js';
import { limitFor } from '../domain/entitlements.js';
import { Incident, IncidentComment, IncidentEvent, Organization } from '../models/index.js';

export async function planOf(organizationId) {
  const organization = await Organization.findById(organizationId).select('plan');
  return organization?.plan || 'free';
}

export async function assertUnderLimit(organizationId, key, used) {
  const plan = await planOf(organizationId);
  const max = limitFor(plan, key);
  if (used >= max) {
    throw new AppError('QUOTA_EXCEEDED', `The ${plan} plan includes ${max}. Upgrade to Pro for the full workspace.`, 403);
  }
}

export async function makeRoomForIncident(organizationId) {
  const plan = await planOf(organizationId);
  const max = limitFor(plan, 'incidents.max');
  const used = await Incident.countDocuments({ organizationId });
  if (used < max) return;
  const oldest = await Incident.findOne({ organizationId, status: 'RESOLVED' }).sort({ createdAt: 1 });
  if (!oldest) {
    throw new AppError('QUOTA_EXCEEDED', `The ${plan} plan keeps ${max} incidents. Upgrade to Pro for the full history.`, 403);
  }
  await IncidentEvent.deleteMany({ incidentId: oldest._id });
  await IncidentComment.deleteMany({ incidentId: oldest._id });
  await oldest.deleteOne();
}

export async function pruneOldest(Model, organizationId, key, sort) {
  const plan = await planOf(organizationId);
  const max = limitFor(plan, key);
  const count = await Model.countDocuments({ organizationId });
  if (count <= max) return;
  const extra = await Model.find({ organizationId }).sort(sort).limit(count - max).select('_id');
  if (extra.length) await Model.deleteMany({ _id: { $in: extra.map((doc) => doc._id) } });
}

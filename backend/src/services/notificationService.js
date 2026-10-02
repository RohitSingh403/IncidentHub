import { log } from '../utils/logger.js';
import { Membership, Notification, TeamMember, User } from '../models/index.js';
import { incidentNumber } from '../utils/presenters.js';

async function recipientIds(incident, service) {
  if (incident.assignedUserId) return [incident.assignedUserId];

  const teamId = incident.assignedTeamId || service?.teamId;
  if (teamId) {
    const links = await TeamMember.find({ teamId });
    if (links.length) return links.map((link) => link.userId);
  }

  const memberships = await Membership.find({
    organizationId: incident.organizationId,
    role: { $ne: 'viewer' },
  });
  return memberships.map((membership) => membership.userId);
}

function titleFor(incident, kind) {
  const label = incidentNumber(incident.number);
  if (kind === 'resolved') return `${label} resolved`;
  if (kind === 'updated') return `${label} updated`;
  return `${label} opened`;
}

export async function notifyIncident(incident, service, kind) {
  try {
    const recipients = await recipientIds(incident, service);
    if (!recipients.length) return;

    const title = titleFor(incident, kind);
    const body = `${incident.title} · ${incident.severity}`;
    const users = await User.find({ _id: { $in: recipients } }).select('email');

    await Notification.insertMany(
      recipients.map((userId) => ({
        organizationId: incident.organizationId,
        userId,
        incidentId: incident._id,
        channel: 'in_app',
        status: 'delivered',
        title,
        body,
        sentAt: new Date(),
      })),
    );

    await Notification.insertMany(
      users.map((user) => ({
        organizationId: incident.organizationId,
        userId: user._id,
        incidentId: incident._id,
        channel: 'email',
        status: 'skipped',
        title,
        body: `${body}. Email delivery is not configured.`,
        error: 'SMTP is not configured',
      })),
    );
  } catch (error) {
    log('error', {
      message: 'Failed to record notifications',
      incidentId: String(incident._id),
      error: error.message,
    });
  }
}

export async function listNotifications(organizationId, userId) {
  const [items, unreadCount] = await Promise.all([
    Notification.find({ organizationId, userId, channel: 'in_app' })
      .sort({ createdAt: -1 })
      .limit(30),
    Notification.countDocuments({
      organizationId,
      userId,
      channel: 'in_app',
      readAt: null,
    }),
  ]);
  return { items, unreadCount };
}

export async function markNotificationRead(organizationId, userId, notificationId) {
  const notification = await Notification.findOne({
    _id: notificationId,
    organizationId,
    userId,
    channel: 'in_app',
  });
  if (!notification) return null;
  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  return notification;
}

export async function markAllRead(organizationId, userId) {
  await Notification.updateMany(
    { organizationId, userId, channel: 'in_app', readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { updated: true };
}

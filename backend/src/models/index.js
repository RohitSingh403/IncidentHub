import mongoose from 'mongoose';
import { SEVERITIES } from '../domain/severity.js';
import { INCIDENT_STATUSES, OPEN_STATUSES } from '../domain/incidentTransitions.js';

const { Schema } = mongoose;

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    isPlatformAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    defaultSeverity: { type: String, enum: SEVERITIES, default: 'SEV-3' },
    plan: { type: String, default: 'free' },
    incidentCounter: { type: Number, default: 0 },
    slackWebhookUrl: { type: String, default: '', select: false },
    githubRepo: { type: String, default: '' },
    githubToken: { type: String, default: '', select: false },
  },
  { timestamps: true },
);

const membershipSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['owner', 'admin', 'incident_manager', 'engineer', 'viewer'],
      required: true,
    },
  },
  { timestamps: true },
);
membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

const teamSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 500 },
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const teamMemberSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
teamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });
teamMemberSchema.index({ organizationId: 1, teamId: 1 });

const serviceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 2000 },
    environment: {
      type: String,
      enum: ['production', 'staging', 'development'],
      default: 'production',
    },
    url: { type: String, required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    criticality: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    monitoringEnabled: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['unknown', 'healthy', 'degraded', 'down'],
      default: 'unknown',
    },
    dependsOn: [{ type: Schema.Types.ObjectId, ref: 'Service' }],
  },
  { timestamps: true },
);
serviceSchema.index({ organizationId: 1, name: 1 });

const monitorSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true, unique: true },
    url: { type: String, required: true },
    method: { type: String, enum: ['GET', 'POST'], default: 'GET' },
    intervalSeconds: { type: Number, default: 60 },
    timeoutMs: { type: Number, default: 5000 },
    expectedStatus: { type: Number, default: 200 },
    expectedJsonPath: { type: String, default: '' },
    expectedJsonValue: { type: String, default: '' },
    failureThreshold: { type: Number, default: 3 },
    recoveryThreshold: { type: Number, default: 2 },
    latencyThresholdMs: { type: Number, default: 2000 },
    nextCheckAt: { type: Date, default: () => new Date() },
    lockedUntil: { type: Date, default: null },
    consecutiveFailures: { type: Number, default: 0 },
    consecutiveSuccesses: { type: Number, default: 0 },
    consecutiveSlow: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    lastCheckAt: { type: Date, default: null },
    lastStatusCode: { type: Number, default: null },
    lastResponseTimeMs: { type: Number, default: null },
    lastError: { type: String, default: null },
    lastSuccess: { type: Boolean, default: null },
  },
  { timestamps: true },
);
monitorSchema.index({ enabled: 1, nextCheckAt: 1 });

const healthCheckSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', required: true },
    statusCode: { type: Number, default: null },
    responseTimeMs: { type: Number, default: null },
    success: { type: Boolean, required: true },
    error: { type: String, default: null },
    checkedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);
healthCheckSchema.index({ serviceId: 1, checkedAt: -1 });
healthCheckSchema.index({ organizationId: 1, checkedAt: -1 });
healthCheckSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const incidentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    number: { type: Number, required: true },
    title: { type: String, required: true, maxlength: 140 },
    description: { type: String, default: '', maxlength: 5000 },
    severity: { type: String, enum: SEVERITIES, required: true },
    severityRank: { type: Number, required: true },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'OPEN' },
    source: { type: String, enum: ['monitor', 'manual'], required: true },
    trigger: { type: String, enum: ['availability', 'latency', 'manual'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedTeamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    assignedUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    detectedAt: { type: Date, required: true },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    escalationPolicyId: { type: Schema.Types.ObjectId, ref: 'EscalationPolicy', default: null },
    escalationStep: { type: Number, default: null },
    escalationVersion: { type: Number, default: 0 },
    escalationJobId: { type: String, default: null },
  },
  { timestamps: true },
);
incidentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
incidentSchema.index({ organizationId: 1, createdAt: -1 });
incidentSchema.index({ organizationId: 1, number: 1 }, { unique: true });
incidentSchema.index(
  { organizationId: 1, serviceId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: 'monitor',
      status: { $in: OPEN_STATUSES },
    },
  },
);

const incidentEventSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);
incidentEventSchema.index({ incidentId: 1, createdAt: 1 });

const incidentCommentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 5000 },
    visibility: { type: String, enum: ['internal', 'public'], default: 'internal' },
  },
  { timestamps: true },
);
incidentCommentSchema.index({ incidentId: 1, createdAt: 1 });

const notificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', default: null },
    channel: { type: String, enum: ['in_app', 'email'], required: true },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed', 'skipped'],
      default: 'pending',
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    sentAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    error: { type: String, default: null },
    readAt: { type: Date, default: null },
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
notificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

const statusPageSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', maxlength: 300 },
    published: { type: Boolean, default: true },
  },
  { timestamps: true },
);
statusPageSchema.index({ organizationId: 1 });

const statusComponentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    statusPageId: { type: Schema.Types.ObjectId, ref: 'StatusPage', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { timestamps: true },
);
statusComponentSchema.index({ statusPageId: 1, serviceId: 1 }, { unique: true });

const statusIncidentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    statusPageId: { type: Schema.Types.ObjectId, ref: 'StatusPage', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', default: null },
    title: { type: String, required: true, maxlength: 140 },
    publicStatus: {
      type: String,
      enum: ['investigating', 'identified', 'monitoring', 'resolved'],
      default: 'investigating',
    },
    startedAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
statusIncidentSchema.index({ statusPageId: 1, publicStatus: 1, startedAt: -1 });
statusIncidentSchema.index({ incidentId: 1 });

const statusUpdateSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    statusIncidentId: { type: Schema.Types.ObjectId, ref: 'StatusIncident', required: true },
    publicStatus: {
      type: String,
      enum: ['investigating', 'identified', 'monitoring', 'resolved'],
      required: true,
    },
    message: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true },
);
statusUpdateSchema.index({ statusIncidentId: 1, createdAt: 1 });

const postmortemSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', required: true },
    summary: { type: String, default: '', maxlength: 5000 },
    impact: { type: String, default: '', maxlength: 5000 },
    timeline: { type: String, default: '', maxlength: 10000 },
    rootCause: { type: String, default: '', maxlength: 5000 },
    contributingFactors: { type: String, default: '', maxlength: 5000 },
    resolution: { type: String, default: '', maxlength: 5000 },
    lessonsLearned: { type: String, default: '', maxlength: 5000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
postmortemSchema.index({ organizationId: 1, incidentId: 1 }, { unique: true });

const postmortemActionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    postmortemId: { type: Schema.Types.ObjectId, ref: 'Postmortem', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dueAt: { type: Date, default: null },
    status: { type: String, enum: ['pending', 'done'], default: 'pending' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
postmortemActionSchema.index({ postmortemId: 1, createdAt: 1 });

const onCallScheduleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    timezone: { type: String, default: 'Asia/Kolkata' },
    rotation: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
    startDate: { type: Date, required: true },
    handoffMinutes: { type: Number, default: 0 },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);
onCallScheduleSchema.index({ organizationId: 1, teamId: 1 }, { unique: true });

const scheduleOverrideSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'OnCallSchedule', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  { timestamps: true },
);
scheduleOverrideSchema.index({ scheduleId: 1, startsAt: 1 });

const escalationStepSchema = new Schema(
  {
    target: {
      type: String,
      enum: ['on_call', 'team_manager', 'incident_manager', 'user'],
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    waitMinutes: { type: Number, default: 5 },
  },
  { _id: false },
);

const escalationPolicySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    steps: { type: [escalationStepSchema], required: true },
  },
  { timestamps: true },
);
escalationPolicySchema.index({ organizationId: 1, teamId: 1 }, { unique: true });

export const User = model('User', userSchema);
export const Organization = model('Organization', organizationSchema);
export const Membership = model('Membership', membershipSchema);
export const Team = model('Team', teamSchema);
export const TeamMember = model('TeamMember', teamMemberSchema);
export const Service = model('Service', serviceSchema);
export const Monitor = model('Monitor', monitorSchema);
export const HealthCheck = model('HealthCheck', healthCheckSchema);
export const Incident = model('Incident', incidentSchema);
export const IncidentEvent = model('IncidentEvent', incidentEventSchema);
export const IncidentComment = model('IncidentComment', incidentCommentSchema);
export const Notification = model('Notification', notificationSchema);
export const Postmortem = model('Postmortem', postmortemSchema);
export const PostmortemAction = model('PostmortemAction', postmortemActionSchema);
export const OnCallSchedule = model('OnCallSchedule', onCallScheduleSchema);
export const ScheduleOverride = model('ScheduleOverride', scheduleOverrideSchema);
export const EscalationPolicy = model('EscalationPolicy', escalationPolicySchema);
export const StatusPage = model('StatusPage', statusPageSchema);
export const StatusComponent = model('StatusComponent', statusComponentSchema);
export const StatusIncident = model('StatusIncident', statusIncidentSchema);
export const StatusUpdate = model('StatusUpdate', statusUpdateSchema);

const auditEventSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, maxlength: 80 },
    targetType: { type: String, default: '', maxlength: 40 },
    targetId: { type: Schema.Types.ObjectId, default: null },
    message: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true },
);
auditEventSchema.index({ organizationId: 1, createdAt: -1 });

const maintenanceWindowSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    reason: { type: String, default: '', maxlength: 200 },
  },
  { timestamps: true },
);
maintenanceWindowSchema.index({ organizationId: 1, serviceId: 1, startsAt: 1 });

const sloSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    targetPercent: { type: Number, required: true },
    windowDays: { type: Number, default: 30 },
  },
  { timestamps: true },
);
sloSchema.index({ organizationId: 1, serviceId: 1 }, { unique: true });

const runbookSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, default: '', maxlength: 10000 },
  },
  { timestamps: true },
);
runbookSchema.index({ organizationId: 1, serviceId: 1 }, { unique: true });

const apiKeySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    prefix: { type: String, required: true },
    hash: { type: String, required: true, unique: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
apiKeySchema.index({ organizationId: 1, createdAt: -1 });

const webhookEndpointSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    url: { type: String, required: true, maxlength: 500 },
    secret: { type: String, required: true },
    events: [{ type: String }],
  },
  { timestamps: true },
);
webhookEndpointSchema.index({ organizationId: 1 });

const webhookDeliverySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    endpointId: { type: Schema.Types.ObjectId, ref: 'WebhookEndpoint', required: true },
    event: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
  },
  { timestamps: true },
);
webhookDeliverySchema.index({ status: 1, createdAt: 1 });

export const AuditEvent = model('AuditEvent', auditEventSchema);
export const MaintenanceWindow = model('MaintenanceWindow', maintenanceWindowSchema);
export const Slo = model('Slo', sloSchema);
export const Runbook = model('Runbook', runbookSchema);
export const ApiKey = model('ApiKey', apiKeySchema);
export const WebhookEndpoint = model('WebhookEndpoint', webhookEndpointSchema);
export const WebhookDelivery = model('WebhookDelivery', webhookDeliverySchema);

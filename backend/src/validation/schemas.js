import { z } from 'zod';
import { SEVERITIES } from '../domain/severity.js';
import { INCIDENT_STATUSES } from '../domain/incidentTransitions.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

const knownTimezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Unknown timezone');

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200),
    password: passwordSchema,
    organizationName: z.string().trim().min(1).max(120),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(1),
  }),
});

export const updateOrganizationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    timezone: knownTimezone,
    defaultSeverity: z.enum(SEVERITIES),
  }),
});

export const addMemberSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200),
    password: passwordSchema,
    role: z.enum(['admin', 'incident_manager', 'engineer', 'viewer']),
  }),
});

export const updateMemberSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    role: z.enum(['admin', 'incident_manager', 'engineer', 'viewer']),
  }),
});

export const memberIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const createTeamSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional().default(''),
    managerId: objectId.nullable().optional(),
  }),
});

export const updateTeamSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional().default(''),
    managerId: objectId.nullable().optional(),
  }),
});

export const teamIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const teamMemberSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ userId: objectId }),
});

export const removeTeamMemberSchema = z.object({
  params: z.object({ id: objectId, userId: objectId }),
});

export const createServiceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).optional().default(''),
    environment: z.enum(['production', 'staging', 'development']).default('production'),
    url: z.string().trim().url().max(2000),
    teamId: objectId.nullable().optional(),
    criticality: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    monitoringEnabled: z.boolean().optional().default(true),
  }),
});

export const updateServiceSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).optional().default(''),
    environment: z.enum(['production', 'staging', 'development']),
    url: z.string().trim().url().max(2000),
    teamId: objectId.nullable().optional(),
    criticality: z.enum(['low', 'medium', 'high', 'critical']),
    monitoringEnabled: z.boolean(),
  }),
});

export const serviceIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const updateMonitorSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    url: z.string().trim().url().max(2000),
    method: z.enum(['GET', 'POST']),
    intervalSeconds: z.number().int().min(15).max(86400),
    timeoutMs: z.number().int().min(100).max(30000),
    expectedStatus: z.number().int().min(100).max(599),
    expectedJsonPath: z.string().trim().max(200).optional().default(''),
    expectedJsonValue: z.string().trim().max(200).optional().default(''),
    failureThreshold: z.number().int().min(1).max(20),
    recoveryThreshold: z.number().int().min(1).max(20),
    latencyThresholdMs: z.number().int().min(0).max(60000),
    enabled: z.boolean(),
  }),
});

const blankToUndefined = (value) => (value === '' || value == null ? undefined : value);

export const listIncidentsSchema = z.object({
  query: z.object({
    search: z.preprocess(blankToUndefined, z.string().trim().max(80).optional().default('')),
    severity: z.preprocess(blankToUndefined, z.enum(SEVERITIES).optional()),
    status: z.preprocess(blankToUndefined, z.enum(INCIDENT_STATUSES).optional()),
    serviceId: z.preprocess(blankToUndefined, objectId.optional()),
    sort: z.preprocess(
      (value) => (value === '' || value == null ? 'newest' : value),
      z.enum(['newest', 'oldest', 'severity', 'duration']),
    ),
    range: z.preprocess(
      (value) => (value === '' || value == null ? 'all' : value),
      z.enum(['30d', 'all']),
    ),
  }),
});

export const createIncidentSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().max(5000).optional().default(''),
    serviceId: objectId,
    severity: z.enum(SEVERITIES).optional(),
    assignedTeamId: objectId.nullable().optional(),
    assignedUserId: objectId.nullable().optional(),
  }),
});

export const incidentIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const updateIncidentSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    title: z.string().trim().min(1).max(140).optional(),
    description: z.string().trim().max(5000).optional(),
    severity: z.enum(SEVERITIES).optional(),
    assignedTeamId: objectId.nullable().optional(),
    assignedUserId: objectId.nullable().optional(),
  }),
});

export const transitionSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(INCIDENT_STATUSES),
  }),
});

export const commentSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    content: z.string().trim().min(1).max(5000),
    visibility: z.enum(['internal', 'public']).optional().default('internal'),
  }),
});

export const notificationIdSchema = z.object({
  params: z.object({ id: objectId }),
});

const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date');

export const createScheduleSchema = z.object({
  body: z.object({
    teamId: objectId,
    name: z.string().trim().min(1).max(80),
    timezone: knownTimezone,
    rotation: z.enum(['daily', 'weekly']),
    startDate: instant,
    handoffMinutes: z.number().int().min(0).max(1439).optional().default(0),
    memberIds: z.array(objectId).min(1).max(30),
  }),
});

export const overrideSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    userId: objectId,
    startsAt: instant,
    endsAt: instant,
  }),
});

const escalationStepInput = z.object({
  target: z.enum(['on_call', 'team_manager', 'incident_manager', 'user']),
  userId: objectId.nullable().optional(),
  waitMinutes: z.number().int().min(0).max(1440),
});

export const createPolicySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(80),
    teamId: objectId.nullable().optional(),
    steps: z.array(escalationStepInput).min(1).max(5),
  }),
});

const postmortemBody = z.object({
  summary: z.string().trim().max(5000).optional(),
  impact: z.string().trim().max(5000).optional(),
  timeline: z.string().trim().max(10000).optional(),
  rootCause: z.string().trim().max(5000).optional(),
  contributingFactors: z.string().trim().max(5000).optional(),
  resolution: z.string().trim().max(5000).optional(),
  lessonsLearned: z.string().trim().max(5000).optional(),
});

export const updatePostmortemSchema = z.object({
  params: z.object({ id: objectId }),
  body: postmortemBody,
});

export const createActionSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    title: z.string().trim().min(1).max(200),
    ownerId: objectId.nullable().optional(),
    dueAt: instant.nullable().optional(),
  }),
});

export const updateActionSchema = z.object({
  params: z.object({ id: objectId, actionId: objectId }),
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    ownerId: objectId.nullable().optional(),
    dueAt: instant.nullable().optional(),
    status: z.enum(['pending', 'done']).optional(),
  }),
});

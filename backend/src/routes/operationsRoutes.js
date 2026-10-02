import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import * as operations from '../services/operationsService.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date');

export const operationsRouter = Router();
export const auditRouter = Router();

auditRouter.get(
  '/',
  requirePermission('audit:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.listAudit(req.organizationId), 'Audit log');
  }),
);

operationsRouter.get(
  '/',
  requirePermission('operations:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.getOperations(req.organizationId), 'Operations');
  }),
);

operationsRouter.post(
  '/maintenance',
  requirePermission('operations:write'),
  validate(z.object({
    body: z.object({
      serviceId: objectId,
      startsAt: instant,
      endsAt: instant,
      reason: z.string().trim().max(200).optional().default(''),
    }),
  })),
  asyncHandler(async (req, res) => {
    const window = await operations.createMaintenance(req.organizationId, req.user._id, req.validated.body);
    sendOk(res, window, 'Maintenance window scheduled', 201);
  }),
);

operationsRouter.delete(
  '/maintenance/:id',
  requirePermission('operations:write'),
  validate(z.object({ params: z.object({ id: objectId }) })),
  asyncHandler(async (req, res) => {
    await operations.deleteMaintenance(req.organizationId, req.user._id, req.validated.params.id);
    sendOk(res, { id: req.validated.params.id }, 'Maintenance window removed');
  }),
);

operationsRouter.put(
  '/slos',
  requirePermission('operations:write'),
  validate(z.object({
    body: z.object({
      serviceId: objectId,
      targetPercent: z.number().min(90).max(100),
      windowDays: z.number().int().min(1).max(90).optional().default(30),
    }),
  })),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.saveSlo(req.organizationId, req.user._id, req.validated.body), 'SLO saved');
  }),
);

operationsRouter.put(
  '/runbooks',
  requirePermission('operations:write'),
  validate(z.object({
    body: z.object({
      serviceId: objectId,
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().max(10000).optional().default(''),
    }),
  })),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.saveRunbook(req.organizationId, req.user._id, req.validated.body), 'Runbook saved');
  }),
);

operationsRouter.put(
  '/dependencies',
  requirePermission('operations:write'),
  validate(z.object({
    body: z.object({
      serviceId: objectId,
      dependsOn: z.array(objectId).max(20),
    }),
  })),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.saveDependencies(req.organizationId, req.user._id, req.validated.body), 'Dependencies saved');
  }),
);

operationsRouter.post(
  '/api-keys',
  requirePermission('operations:write'),
  validate(z.object({ body: z.object({ name: z.string().trim().min(1).max(80) }) })),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.createApiKey(req.organizationId, req.user._id, req.validated.body.name), 'API key created', 201);
  }),
);

operationsRouter.post(
  '/api-keys/:id/revoke',
  requirePermission('operations:write'),
  validate(z.object({ params: z.object({ id: objectId }) })),
  asyncHandler(async (req, res) => {
    await operations.revokeApiKey(req.organizationId, req.user._id, req.validated.params.id);
    sendOk(res, { id: req.validated.params.id }, 'API key revoked');
  }),
);

operationsRouter.post(
  '/webhooks',
  requirePermission('operations:write'),
  validate(z.object({
    body: z.object({
      url: z.string().trim().url(),
      events: z.array(z.enum(['incident.opened', 'incident.updated', 'incident.resolved'])).max(3).optional(),
    }),
  })),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.createWebhook(req.organizationId, req.user._id, req.validated.body), 'Webhook created', 201);
  }),
);

operationsRouter.delete(
  '/webhooks/:id',
  requirePermission('operations:write'),
  validate(z.object({ params: z.object({ id: objectId }) })),
  asyncHandler(async (req, res) => {
    await operations.deleteWebhook(req.organizationId, req.user._id, req.validated.params.id);
    sendOk(res, { id: req.validated.params.id }, 'Webhook removed');
  }),
);

operationsRouter.patch(
  '/integrations',
  requirePermission('operations:write'),
  validate(z.object({
    body: z.object({
      slackWebhookUrl: z.string().trim().max(500).optional(),
      githubRepo: z.string().trim().max(120).optional(),
      githubToken: z.string().trim().max(200).optional(),
    }),
  })),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.saveIntegrations(req.organizationId, req.user._id, req.validated.body), 'Integrations saved');
  }),
);

operationsRouter.get(
  '/graph',
  requirePermission('operations:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.dependencyGraph(req.organizationId), 'Dependency graph');
  }),
);

operationsRouter.post(
  '/checkout',
  requirePermission('operations:write'),
  validate(z.object({
    body: z.object({
      plan: z.enum(['pro', 'business']).optional().default('pro'),
    }),
  })),
  asyncHandler(async (req, res) => {
    sendOk(res, await operations.startCheckout(req.organizationId, req.validated.body.plan), 'Checkout');
  }),
);

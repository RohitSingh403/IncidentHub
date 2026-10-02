import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createPolicySchema } from '../validation/schemas.js';
import * as escalationService from '../services/escalationService.js';

export const escalationRouter = Router();

escalationRouter.get(
  '/',
  requirePermission('escalation:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await escalationService.listPolicies(req.organizationId), 'Escalation policies');
  }),
);

escalationRouter.post(
  '/',
  requirePermission('escalation:write'),
  validate(createPolicySchema),
  asyncHandler(async (req, res) => {
    const policy = await escalationService.createPolicy(req.organizationId, req.validated.body);
    sendOk(res, policy, 'Escalation policy created', 201);
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createScheduleSchema, overrideSchema } from '../validation/schemas.js';
import * as onCallService from '../services/onCallService.js';

export const onCallRouter = Router();

onCallRouter.get(
  '/schedules',
  requirePermission('oncall:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await onCallService.listSchedules(req.organizationId), 'On-call schedules');
  }),
);

onCallRouter.post(
  '/schedules',
  requirePermission('oncall:write'),
  validate(createScheduleSchema),
  asyncHandler(async (req, res) => {
    const schedule = await onCallService.createSchedule(req.organizationId, req.validated.body);
    sendOk(res, schedule, 'On-call schedule created', 201);
  }),
);

onCallRouter.post(
  '/schedules/:id/overrides',
  requirePermission('oncall:write'),
  validate(overrideSchema),
  asyncHandler(async (req, res) => {
    const schedule = await onCallService.createOverride(
      req.organizationId,
      req.validated.params.id,
      req.validated.body,
    );
    sendOk(res, schedule, 'Override added', 201);
  }),
);

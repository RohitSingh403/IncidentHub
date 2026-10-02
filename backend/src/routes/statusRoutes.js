import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  addStatusComponentSchema,
  createStatusPageSchema,
  publicSlugSchema,
  statusUpdateSchema,
} from '../validation/schemas.js';
import * as statusPageService from '../services/statusPageService.js';

export const publicStatusRouter = Router();
export const statusPageRouter = Router();

publicStatusRouter.get(
  '/:slug',
  validate(publicSlugSchema),
  asyncHandler(async (req, res) => {
    sendOk(res, await statusPageService.getPublicStatus(req.validated.params.slug), 'Status');
  }),
);

statusPageRouter.get(
  '/',
  requirePermission('status:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await statusPageService.listStatusPages(req.organizationId), 'Status pages');
  }),
);

statusPageRouter.post(
  '/',
  requirePermission('status:write'),
  validate(createStatusPageSchema),
  asyncHandler(async (req, res) => {
    const page = await statusPageService.createStatusPage(req.organizationId, req.validated.body);
    sendOk(res, page, 'Status page created', 201);
  }),
);

statusPageRouter.post(
  '/:id/components',
  requirePermission('status:write'),
  validate(addStatusComponentSchema),
  asyncHandler(async (req, res) => {
    const page = await statusPageService.addComponent(
      req.organizationId,
      req.validated.params.id,
      req.validated.body.serviceId,
    );
    sendOk(res, page, 'Component added', 201);
  }),
);

statusPageRouter.post(
  '/incidents/:id/updates',
  requirePermission('status:write'),
  validate(statusUpdateSchema),
  asyncHandler(async (req, res) => {
    const page = await statusPageService.postPublicUpdate(
      req.organizationId,
      req.validated.params.id,
      req.validated.body,
    );
    sendOk(res, page, 'Public update posted');
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createServiceSchema,
  serviceIdSchema,
  updateMonitorSchema,
  updateServiceSchema,
} from '../validation/schemas.js';
import * as serviceService from '../services/serviceService.js';

export const serviceRouter = Router();

serviceRouter.get(
  '/',
  requirePermission('service:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await serviceService.listServices(req.organizationId), 'Services');
  }),
);

serviceRouter.post(
  '/',
  requirePermission('service:write'),
  validate(createServiceSchema),
  asyncHandler(async (req, res) => {
    const service = await serviceService.createService(req.organizationId, req.validated.body);
    sendOk(res, service, 'Service created', 201);
  }),
);

serviceRouter.get(
  '/:id',
  requirePermission('service:read'),
  validate(serviceIdSchema),
  asyncHandler(async (req, res) => {
    const service = await serviceService.getService(req.organizationId, req.validated.params.id);
    sendOk(res, service, 'Service');
  }),
);

serviceRouter.patch(
  '/:id',
  requirePermission('service:write'),
  validate(updateServiceSchema),
  asyncHandler(async (req, res) => {
    const service = await serviceService.updateService(
      req.organizationId,
      req.validated.params.id,
      req.validated.body,
    );
    sendOk(res, service, 'Service updated');
  }),
);

serviceRouter.delete(
  '/:id',
  requirePermission('service:write'),
  validate(serviceIdSchema),
  asyncHandler(async (req, res) => {
    const result = await serviceService.deleteService(req.organizationId, req.validated.params.id);
    sendOk(res, result, 'Service deleted');
  }),
);

serviceRouter.put(
  '/:id/monitor',
  requirePermission('service:write'),
  validate(updateMonitorSchema),
  asyncHandler(async (req, res) => {
    const service = await serviceService.updateMonitor(
      req.organizationId,
      req.validated.params.id,
      req.validated.body,
    );
    sendOk(res, service, 'Monitor updated');
  }),
);

serviceRouter.post(
  '/:id/monitor/run',
  requirePermission('service:write'),
  validate(serviceIdSchema),
  asyncHandler(async (req, res) => {
    const result = await serviceService.runServiceCheck(req.organizationId, req.validated.params.id);
    sendOk(res, result, 'Check completed');
  }),
);

serviceRouter.get(
  '/:id/checks',
  requirePermission('service:read'),
  validate(serviceIdSchema),
  asyncHandler(async (req, res) => {
    const checks = await serviceService.listChecks(req.organizationId, req.validated.params.id);
    sendOk(res, checks, 'Health checks');
  }),
);

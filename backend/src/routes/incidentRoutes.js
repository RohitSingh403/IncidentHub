import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  commentSchema,
  createIncidentSchema,
  incidentIdSchema,
  listIncidentsSchema,
  notificationIdSchema,
  transitionSchema,
  updateIncidentSchema,
} from '../validation/schemas.js';
import * as incidentService from '../services/incidentService.js';
import * as notificationService from '../services/notificationService.js';
import { presentNotification } from '../utils/presenters.js';
import { getDashboard } from '../services/dashboardService.js';
import { AppError } from '../utils/AppError.js';

export const incidentRouter = Router();

incidentRouter.get(
  '/',
  requirePermission('incident:read'),
  validate(listIncidentsSchema),
  asyncHandler(async (req, res) => {
    const incidents = await incidentService.listIncidents(req.organizationId, req.validated.query);
    sendOk(res, incidents, 'Incidents');
  }),
);

incidentRouter.post(
  '/',
  requirePermission('incident:create'),
  validate(createIncidentSchema),
  asyncHandler(async (req, res) => {
    const incident = await incidentService.createManualIncident(
      req.organizationId,
      req.user._id,
      req.validated.body,
    );
    sendOk(res, incident, 'Incident created', 201);
  }),
);

incidentRouter.get(
  '/:id',
  requirePermission('incident:read'),
  validate(incidentIdSchema),
  asyncHandler(async (req, res) => {
    const incident = await incidentService.getIncident(req.organizationId, req.validated.params.id);
    sendOk(res, incident, 'Incident');
  }),
);

incidentRouter.patch(
  '/:id',
  requirePermission('incident:update'),
  validate(updateIncidentSchema),
  asyncHandler(async (req, res) => {
    const incident = await incidentService.updateIncident(
      req.organizationId,
      req.validated.params.id,
      req.user._id,
      req.validated.body,
    );
    sendOk(res, incident, 'Incident updated');
  }),
);

incidentRouter.post(
  '/:id/transition',
  requirePermission('incident:transition'),
  validate(transitionSchema),
  asyncHandler(async (req, res) => {
    if (req.validated.body.status === 'RESOLVED' && !req.permissions.includes('incident:resolve')) {
      throw new AppError('FORBIDDEN', 'You do not have permission to resolve incidents', 403);
    }
    const incident = await incidentService.transitionIncident(
      req.organizationId,
      req.validated.params.id,
      req.user._id,
      req.validated.body.status,
    );
    sendOk(res, incident, 'Incident updated');
  }),
);

incidentRouter.post(
  '/:id/comments',
  requirePermission('incident:comment'),
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const comment = await incidentService.addComment(
      req.organizationId,
      req.validated.params.id,
      req.user._id,
      req.validated.body,
    );
    sendOk(res, comment, 'Comment added', 201);
  }),
);

export const notificationRouter = Router();

notificationRouter.get(
  '/',
  requirePermission('notification:read'),
  asyncHandler(async (req, res) => {
    const result = await notificationService.listNotifications(req.organizationId, req.user._id);
    sendOk(
      res,
      {
        items: result.items.map(presentNotification),
        unreadCount: result.unreadCount,
      },
      'Notifications',
    );
  }),
);

notificationRouter.post(
  '/read-all',
  requirePermission('notification:read'),
  asyncHandler(async (req, res) => {
    const result = await notificationService.markAllRead(req.organizationId, req.user._id);
    sendOk(res, result, 'Notifications marked read');
  }),
);

notificationRouter.post(
  '/:id/read',
  requirePermission('notification:read'),
  validate(notificationIdSchema),
  asyncHandler(async (req, res) => {
    const notification = await notificationService.markNotificationRead(
      req.organizationId,
      req.user._id,
      req.validated.params.id,
    );
    if (!notification) throw new AppError('NOTIFICATION_NOT_FOUND', 'Notification does not exist', 404);
    sendOk(res, presentNotification(notification), 'Notification marked read');
  }),
);

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  requirePermission('incident:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await getDashboard(req.organizationId), 'Dashboard');
  }),
);

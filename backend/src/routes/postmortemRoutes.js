import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { incidentIdSchema, createActionSchema, updateActionSchema, updatePostmortemSchema } from '../validation/schemas.js';
import * as postmortemService from '../services/postmortemService.js';

export const postmortemRouter = Router();

postmortemRouter.get(
  '/',
  requirePermission('postmortem:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await postmortemService.listPostmortems(req.organizationId), 'Postmortems');
  }),
);

postmortemRouter.get(
  '/:id',
  requirePermission('postmortem:read'),
  validate(incidentIdSchema),
  asyncHandler(async (req, res) => {
    sendOk(res, await postmortemService.getPostmortem(req.organizationId, req.validated.params.id), 'Postmortem');
  }),
);

postmortemRouter.patch(
  '/:id',
  requirePermission('postmortem:write'),
  validate(updatePostmortemSchema),
  asyncHandler(async (req, res) => {
    const postmortem = await postmortemService.updatePostmortem(
      req.organizationId,
      req.validated.params.id,
      req.validated.body,
    );
    sendOk(res, postmortem, 'Postmortem saved');
  }),
);

postmortemRouter.post(
  '/:id/actions',
  requirePermission('postmortem:write'),
  validate(createActionSchema),
  asyncHandler(async (req, res) => {
    const postmortem = await postmortemService.addAction(
      req.organizationId,
      req.validated.params.id,
      req.validated.body,
    );
    sendOk(res, postmortem, 'Action added', 201);
  }),
);

postmortemRouter.patch(
  '/:id/actions/:actionId',
  requirePermission('postmortem:write'),
  validate(updateActionSchema),
  asyncHandler(async (req, res) => {
    const postmortem = await postmortemService.updateAction(
      req.organizationId,
      req.validated.params.id,
      req.validated.params.actionId,
      req.validated.body,
    );
    sendOk(res, postmortem, 'Action updated');
  }),
);

export function mountIncidentPostmortems(incidentRouter) {
  incidentRouter.post(
    '/:id/postmortem',
    requirePermission('postmortem:write'),
    validate(incidentIdSchema),
    asyncHandler(async (req, res) => {
      const postmortem = await postmortemService.createForIncident(
        req.organizationId,
        req.validated.params.id,
        req.user._id,
      );
      sendOk(res, postmortem, 'Postmortem created', 201);
    }),
  );

  incidentRouter.get(
    '/:id/postmortem',
    requirePermission('postmortem:read'),
    validate(incidentIdSchema),
    asyncHandler(async (req, res) => {
      const postmortem = await postmortemService.getForIncident(req.organizationId, req.validated.params.id);
      sendOk(res, postmortem, 'Postmortem');
    }),
  );
}

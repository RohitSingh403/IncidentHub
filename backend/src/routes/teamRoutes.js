import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createTeamSchema,
  removeTeamMemberSchema,
  teamIdSchema,
  teamMemberSchema,
  updateTeamSchema,
} from '../validation/schemas.js';
import * as teamService from '../services/teamService.js';

export const teamRouter = Router();

teamRouter.get(
  '/',
  requirePermission('team:read'),
  asyncHandler(async (req, res) => {
    sendOk(res, await teamService.listTeams(req.organizationId), 'Teams');
  }),
);

teamRouter.post(
  '/',
  requirePermission('team:write'),
  validate(createTeamSchema),
  asyncHandler(async (req, res) => {
    const team = await teamService.createTeam(req.organizationId, req.validated.body);
    sendOk(res, team, 'Team created', 201);
  }),
);

teamRouter.get(
  '/:id',
  requirePermission('team:read'),
  validate(teamIdSchema),
  asyncHandler(async (req, res) => {
    const team = await teamService.getTeam(req.organizationId, req.validated.params.id);
    sendOk(res, team, 'Team');
  }),
);

teamRouter.patch(
  '/:id',
  requirePermission('team:write'),
  validate(updateTeamSchema),
  asyncHandler(async (req, res) => {
    const team = await teamService.updateTeam(
      req.organizationId,
      req.validated.params.id,
      req.validated.body,
    );
    sendOk(res, team, 'Team updated');
  }),
);

teamRouter.delete(
  '/:id',
  requirePermission('team:write'),
  validate(teamIdSchema),
  asyncHandler(async (req, res) => {
    const result = await teamService.deleteTeam(req.organizationId, req.validated.params.id);
    sendOk(res, result, 'Team deleted');
  }),
);

teamRouter.post(
  '/:id/members',
  requirePermission('team:write'),
  validate(teamMemberSchema),
  asyncHandler(async (req, res) => {
    const team = await teamService.addTeamMember(
      req.organizationId,
      req.validated.params.id,
      req.validated.body.userId,
    );
    sendOk(res, team, 'Team member added');
  }),
);

teamRouter.delete(
  '/:id/members/:userId',
  requirePermission('team:write'),
  validate(removeTeamMemberSchema),
  asyncHandler(async (req, res) => {
    const team = await teamService.removeTeamMember(
      req.organizationId,
      req.validated.params.id,
      req.validated.params.userId,
    );
    sendOk(res, team, 'Team member removed');
  }),
);

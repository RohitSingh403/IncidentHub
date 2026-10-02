import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  addMemberSchema,
  memberIdSchema,
  updateMemberSchema,
  updateOrganizationSchema,
} from '../validation/schemas.js';
import * as organizationService from '../services/organizationService.js';

export const organizationRouter = Router();

organizationRouter.get(
  '/',
  requirePermission('org:read'),
  asyncHandler(async (req, res) => {
    const organization = await organizationService.getOrganization(
      req.organizationId,
      req.user,
      req.membership,
    );
    sendOk(res, organization, 'Organization');
  }),
);

organizationRouter.patch(
  '/',
  requirePermission('org:update'),
  validate(updateOrganizationSchema),
  asyncHandler(async (req, res) => {
    const organization = await organizationService.updateOrganization(
      req.organizationId,
      req.validated.body,
    );
    sendOk(res, organization, 'Organization updated');
  }),
);

export const memberRouter = Router();

memberRouter.get(
  '/',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const members = await organizationService.listMembers(req.organizationId);
    sendOk(res, members, 'Members');
  }),
);

memberRouter.post(
  '/',
  requirePermission('member:manage'),
  validate(addMemberSchema),
  asyncHandler(async (req, res) => {
    const member = await organizationService.addMember(req.organizationId, req.validated.body);
    sendOk(res, member, 'Member added', 201);
  }),
);

memberRouter.patch(
  '/:id',
  requirePermission('member:manage'),
  validate(updateMemberSchema),
  asyncHandler(async (req, res) => {
    const member = await organizationService.updateMemberRole(
      req.organizationId,
      req.validated.params.id,
      req.validated.body.role,
    );
    sendOk(res, member, 'Role updated');
  }),
);

memberRouter.delete(
  '/:id',
  requirePermission('member:manage'),
  validate(memberIdSchema),
  asyncHandler(async (req, res) => {
    const result = await organizationService.removeMember(
      req.organizationId,
      req.validated.params.id,
      req.user._id,
    );
    sendOk(res, result, 'Member removed');
  }),
);

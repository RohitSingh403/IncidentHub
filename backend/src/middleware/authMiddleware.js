import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/token.js';
import { permissionsFor } from '../domain/permissions.js';
import { Membership, User } from '../models/index.js';
import { findApiKey } from '../services/operationsService.js';

export async function authMiddleware(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    if (token.startsWith('ih_')) {
      const apiKey = await findApiKey(token);
      if (!apiKey) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      req.user = apiKey.user;
      req.membership = apiKey.membership;
      req.organizationId = apiKey.membership.organizationId;
      req.permissions = permissionsFor(apiKey.membership.role);
      next();
      return;
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const membership = await Membership.findOne({
      userId: payload.userId,
      organizationId: payload.organizationId,
    });
    if (!membership) {
      throw new AppError('FORBIDDEN', 'You are not a member of this organization', 403);
    }

    const user = await User.findById(payload.userId);
    if (!user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    req.user = user;
    req.membership = membership;
    req.organizationId = membership.organizationId;
    req.permissions = permissionsFor(membership.role);
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.permissions?.includes(permission)) {
      next(new AppError('FORBIDDEN', 'You do not have permission to do that', 403));
      return;
    }
    next();
  };
}

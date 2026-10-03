import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { loginRateLimit, registerRateLimit } from '../middleware/rateLimit.js';
import { loginSchema, registerSchema } from '../validation/schemas.js';
import * as authService from '../services/authService.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  registerRateLimit,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.validated.body);
    sendOk(res, result, 'Account created', 201);
  }),
);

authRouter.post(
  '/login',
  loginRateLimit,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.validated.body);
    sendOk(res, result, 'Logged in');
  }),
);

authRouter.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await authService.currentSession(req.user, req.membership);
    sendOk(res, { user }, 'Current session');
  }),
);

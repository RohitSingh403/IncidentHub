import rateLimit from 'express-rate-limit';
import { getEnv } from '../config/env.js';

export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => getEnv().nodeEnv === 'test',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many login attempts. Try again shortly.',
      },
    });
  },
});

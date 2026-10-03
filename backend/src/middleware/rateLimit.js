import rateLimit from 'express-rate-limit';
import { getEnv } from '../config/env.js';

function limited(message, limit, windowMs) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => getEnv().nodeEnv === 'test' || req.method === 'GET' || req.method === 'HEAD',
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message },
      });
    },
  });
}

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

export const registerRateLimit = limited('Too many new accounts from this network. Try again later.', 5, 15 * 60 * 1000);

export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => getEnv().nodeEnv === 'test',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' },
    });
  },
});

export const writeRateLimit = limited('Too many changes. Wait a minute and try again.', 60, 60 * 1000);

import crypto from 'node:crypto';
import { getEnv } from '../config/env.js';
import { log } from '../utils/logger.js';

export function requestContext(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  const started = Date.now();

  res.on('finish', () => {
    if (getEnv().nodeEnv === 'test') return;
    log('info', {
      requestId: req.requestId,
      userId: req.user?._id ? String(req.user._id) : undefined,
      organizationId: req.organizationId ? String(req.organizationId) : undefined,
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - started,
    });
  });

  next();
}

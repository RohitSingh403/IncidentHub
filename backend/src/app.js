import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getEnv } from './config/env.js';
import { requestContext } from './middleware/requestContext.js';
import { errorMiddleware, notFound } from './middleware/errorMiddleware.js';
import { apiRouter } from './routes/index.js';
import { applyBillingEvent } from './services/operationsService.js';

export function createApp() {
  const app = express();
  const env = getEnv();

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: env.nodeEnv === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        imgSrc: ["'self'", 'data:'],
      },
    } : false,
  }));
  app.use(cors({ origin: env.clientOrigin }));
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
    try {
      const result = await applyBillingEvent(req.body, req.headers['stripe-signature']);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(requestContext);
  app.use('/api', apiRouter);
  const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (env.nodeEnv === 'production') {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
        if (error) next();
      });
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ name: 'IncidentHub', status: 'ok' });
    });
  }
  app.use(notFound);
  app.use(errorMiddleware);
  return app;
}

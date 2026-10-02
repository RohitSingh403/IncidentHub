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
  app.use(helmet());
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
  app.get('/', (_req, res) => {
    res.json({ name: 'IncidentHub', status: 'ok' });
  });
  app.use('/api', apiRouter);
  app.use(notFound);
  app.use(errorMiddleware);
  return app;
}

import { Router } from 'express';
import { getEnv } from '../config/env.js';

let demoDown = false;

export const demoRouter = Router();

demoRouter.get('/probe', (_req, res) => {
  if (demoDown) {
    res.status(503).json({ status: 'down' });
    return;
  }
  res.json({ status: 'healthy' });
});

demoRouter.post('/probe', (req, res) => {
  if (getEnv().nodeEnv === 'production') {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
    return;
  }
  demoDown = req.body?.mode === 'down';
  res.json({ success: true, data: { mode: demoDown ? 'down' : 'up' }, message: 'Probe updated' });
});

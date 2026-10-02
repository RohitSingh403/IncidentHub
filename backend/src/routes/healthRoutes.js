import mongoose from 'mongoose';
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { redisStatus } from '../queues/index.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, message: 'IncidentHub API is up' });
});

healthRouter.get(
  '/db',
  asyncHandler(async (_req, res) => {
    await mongoose.connection.db.admin().ping();
    res.json({ success: true, data: { status: 'ok' }, message: 'Database is reachable' });
  }),
);

healthRouter.get(
  '/redis',
  asyncHandler(async (_req, res) => {
    const data = await redisStatus();
    const message = data.status === 'ok' ? 'Redis is reachable' : 'Redis is not configured';
    res.json({ success: true, data, message });
  }),
);

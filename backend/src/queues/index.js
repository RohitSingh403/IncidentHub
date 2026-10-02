import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getEnv } from '../config/env.js';
import { log } from '../utils/logger.js';

let connection;
const queues = new Map();

export function getRedis() {
  const { redisUrl } = getEnv();
  if (!redisUrl) return null;
  if (!connection) {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

function queue(name) {
  const redis = getRedis();
  if (!redis) return null;
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, { connection: redis }));
  }
  return queues.get(name);
}

export function getMonitoringQueue() {
  return queue('monitoring');
}

export function getEscalationQueue() {
  return queue('escalation');
}

export async function enqueueMonitorCheck(monitorId) {
  const monitoring = getMonitoringQueue();
  if (!monitoring) return null;
  try {
    await monitoring.add(
      'check',
      { monitorId: String(monitorId) },
      {
        jobId: `monitor:${monitorId}`,
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    return true;
  } catch (error) {
    if (!/exists|duplicate/i.test(error.message)) {
      log('error', { message: 'Failed to enqueue monitor check', error: error.message });
    }
    return false;
  }
}

export async function enqueueEscalation(incidentId, stepIndex, delayMs) {
  const escalation = getEscalationQueue();
  if (!escalation) {
    log('info', {
      message: 'Escalation delay was not queued because REDIS_URL is unset',
      incidentId: String(incidentId),
      stepIndex,
    });
    return null;
  }

  const job = await escalation.add(
    'advance',
    { incidentId: String(incidentId) },
    {
      delay: Math.max(0, delayMs),
      jobId: `esc:${incidentId}:${stepIndex}`,
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
  return job.id;
}

export async function cancelEscalation(jobId) {
  const escalation = getEscalationQueue();
  if (!escalation || !jobId) return;
  try {
    const job = await escalation.getJob(jobId);
    if (job) await job.remove();
  } catch (error) {
    log('error', { message: 'Failed to cancel escalation job', jobId, error: error.message });
  }
}

export async function redisStatus() {
  const redis = getRedis();
  if (!redis) return { status: 'skipped' };
  const pong = await redis.ping();
  return { status: pong === 'PONG' ? 'ok' : 'down' };
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((item) => item.close()));
  queues.clear();
  if (connection) {
    await connection.quit();
    connection = null;
  }
}

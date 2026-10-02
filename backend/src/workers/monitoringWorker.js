import { Worker } from 'bullmq';
import { connectDb } from '../config/db.js';
import { getEnv } from '../config/env.js';
import { log } from '../utils/logger.js';
import { claimAndCheck, enqueueDueMonitors, processDueMonitor } from '../services/monitoringService.js';
import { advanceEscalation } from '../services/escalationService.js';
import { closeQueues, getRedis } from '../queues/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;
let scheduler;
const workers = [];

function stop() {
  running = false;
  if (scheduler) clearInterval(scheduler);
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

async function pollLoop() {
  while (running) {
    try {
      const worked = await processDueMonitor();
      await sleep(worked ? 50 : 2000);
    } catch (error) {
      log('error', { message: 'Monitoring worker iteration failed', error: error.message });
      await sleep(2000);
    }
  }
}

async function startQueues() {
  const connection = getRedis();
  workers.push(
    new Worker(
      'monitoring',
      async (job) => {
        await claimAndCheck(job.data.monitorId);
      },
      { connection },
    ),
    new Worker(
      'escalation',
      async (job) => {
        await advanceEscalation(job.data.incidentId);
      },
      { connection },
    ),
  );

  scheduler = setInterval(() => {
    enqueueDueMonitors().catch((error) => {
      log('error', { message: 'Failed to enqueue due monitors', error: error.message });
    });
  }, 5000);
  await enqueueDueMonitors();

  while (running) await sleep(1000);
}

await connectDb();

if (getEnv().redisUrl) {
  try {
    const pong = await getRedis().ping();
    if (pong !== 'PONG') throw new Error('Redis ping failed');
    log('info', { message: 'Monitoring worker started with Redis queues' });
    await startQueues();
  } catch (error) {
    log('error', {
      message: 'Redis unavailable, falling back to the in-process monitor loop',
      error: error.message,
    });
    await pollLoop();
  }
} else {
  log('info', { message: 'Monitoring worker started without Redis' });
  await pollLoop();
}

await Promise.all(workers.map((worker) => worker.close()));
await closeQueues();
log('info', { message: 'Monitoring worker stopped' });
process.exit(0);

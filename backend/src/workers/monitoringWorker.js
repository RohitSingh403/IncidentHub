import { connectDb } from '../config/db.js';
import { log } from '../utils/logger.js';
import { processDueMonitor } from '../services/monitoringService.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = true;

process.on('SIGTERM', () => {
  running = false;
});
process.on('SIGINT', () => {
  running = false;
});

await connectDb();
log('info', { message: 'Monitoring worker started' });

while (running) {
  try {
    const worked = await processDueMonitor();
    await sleep(worked ? 50 : 2000);
  } catch (error) {
    log('error', { message: 'Monitoring worker iteration failed', error: error.message });
    await sleep(2000);
  }
}

log('info', { message: 'Monitoring worker stopped' });
process.exit(0);

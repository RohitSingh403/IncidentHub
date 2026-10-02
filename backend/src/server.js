import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { getEnv } from './config/env.js';
import { log } from './utils/logger.js';

const env = getEnv();
await connectDb();

const server = createApp().listen(env.port, '0.0.0.0', () => {
  log('info', { message: 'API listening', port: env.port });
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = ['src/server.js', 'src/workers/monitoringWorker.js'].map((script) => {
  const child = spawn(process.execPath, [script], { cwd: backendRoot, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM') process.exit(code ?? 1);
  });
  return child;
});

function stop() {
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

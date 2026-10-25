import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const children = [
  spawn(node, ['node_modules/tsx/dist/cli.mjs', 'src/cli/index.ts', 'ui', '--no-open'], {
    cwd: root,
    stdio: 'inherit',
  }),
  spawn(node, ['node_modules/vite/bin/vite.js', '--config', 'web/vite.config.ts'], {
    cwd: root,
    stdio: 'inherit',
  }),
];

function stop() {
  for (const child of children) {
    child.kill('SIGTERM');
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exit(code ?? 0);
  });
}

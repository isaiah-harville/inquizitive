import { spawn } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const standalone = join(root, '.next', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) {
  console.error('No server build found. Run `bun run build:server` first.');
  process.exit(1);
}
cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true });
cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true });
const child = spawn('node', [join(standalone, 'server.js')], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));

import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicIndex = resolve(root, 'apps/server/public/index.html');
const serverEntry = resolve(root, 'apps/server/dist/index.js');

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      // Ensure Vite/TypeScript are available even when the host sets production install.
      NPM_CONFIG_PRODUCTION: 'false',
      NODE_ENV: process.env.NODE_ENV || 'production',
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(serverEntry) || !existsSync(publicIndex)) {
  console.log('[start] Building full VAMOOS app (web UI + API)...');
  run('npm', ['run', 'build']);
}

if (!existsSync(serverEntry)) {
  console.error('[start] Missing apps/server/dist/index.js after build');
  process.exit(1);
}
if (!existsSync(publicIndex)) {
  console.error('[start] Missing apps/server/public/index.html after build');
  process.exit(1);
}

console.log('[start] Launching VAMOOS (API + web UI)');
run('node', ['apps/server/dist/index.js']);

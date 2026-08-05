/**
 * Guard: after `npm run build`, fail if shipped artifacts still differ from git.
 * Keeps apps/server/public + apps/server/dist from drifting behind source.
 *
 * Usage: npm run predeploy
 */
import { execSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let out = '';
try {
  out = execSync('git status --porcelain -- apps/server/public apps/server/dist', {
    cwd: root,
    encoding: 'utf8',
  });
} catch (err) {
  console.error('[check-shipped-artifacts] git status failed');
  console.error(err);
  process.exit(1);
}

const dirty = out
  .split(/\r?\n/)
  .map((l) => l.trimEnd())
  .filter(Boolean);

if (dirty.length) {
  console.error(
    '[check-shipped-artifacts] FAIL — committed build output is stale vs this build.',
  );
  console.error(
    'Commit apps/server/public and apps/server/dist (repo policy ships these for hosts that skip rebuild).',
  );
  console.error(dirty.join('\n'));
  process.exit(1);
}

console.log('[check-shipped-artifacts] OK — public/ and dist/ match the build.');

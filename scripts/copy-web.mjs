import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'apps/web/dist');
const dest = resolve(root, 'apps/server/public');

if (!existsSync(resolve(src, 'index.html'))) {
  console.error('[copy-web] Missing apps/web/dist/index.html — run the web build first.');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[copy-web] Copied ${src} → ${dest}`);

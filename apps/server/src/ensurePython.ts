/**
 * Ensure a Python 3 binary for Dixon-Coles on hosts without system Python.
 * Prefers /tmp (always writable on most PaaS) then repo .tools/.
 */
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { arch, platform, tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import http from 'http';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));

const STANDALONE: Record<string, { url: string; binRel: string }> = {
  'linux-x64': {
    url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20260211/cpython-3.12.12%2B20260211-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz',
    binRel: 'python/bin/python3',
  },
  'linux-arm64': {
    url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20260211/cpython-3.12.12%2B20260211-aarch64-unknown-linux-gnu-install_only_stripped.tar.gz',
    binRel: 'python/bin/python3',
  },
};

let cached: string | null | undefined;
let bootPromise: Promise<string | null> | null = null;

function repoRoots(): string[] {
  return [
    resolve(__dirname, '../../..'), // apps/server/dist → monorepo root
    resolve(__dirname, '../..'), // apps/server → maybe monorepo is apps?
    process.cwd(),
    resolve(process.cwd(), '..'),
  ];
}

function probe(bin: string | null | undefined): boolean {
  if (!bin) return false;
  const isPy = bin === 'py' || /(^|[\\/])py(\.exe)?$/i.test(bin);
  const args = isPy ? ['-3', '-c', 'print(1)'] : ['-c', 'print(1)'];
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  });
  return r.status === 0;
}

function markerPaths(): string[] {
  const paths = [resolve(tmpdir(), 'vamoos-python', 'python-bin.txt')];
  for (const root of repoRoots()) {
    paths.push(resolve(root, '.tools', 'python-bin.txt'));
  }
  return paths;
}

function readMarkers(): string | null {
  for (const marker of markerPaths()) {
    if (!existsSync(marker)) continue;
    try {
      const bin = readFileSync(marker, 'utf8').trim();
      if (probe(bin)) return bin;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function saveMarker(bin: string, dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'python-bin.txt'), bin, 'utf8');
}

function findExisting(): string | null {
  const fromEnv = process.env.PYTHON_PATH?.trim() || process.env.PYTHON?.trim();
  const candidates: string[] = [];
  if (fromEnv) candidates.push(fromEnv);
  const marked = readMarkers();
  if (marked) candidates.push(marked);

  for (const root of [resolve(tmpdir(), 'vamoos-python'), ...repoRoots().map((r) => resolve(r, '.tools'))]) {
    candidates.push(resolve(root, 'python', 'bin', 'python3'));
    candidates.push(resolve(root, 'python', 'bin', 'python'));
  }
  candidates.push('python3', 'python', 'py');

  for (const bin of candidates) {
    if (probe(bin)) return bin === 'py' ? 'py' : bin;
  }
  return null;
}

function platformKey(): string | null {
  const p = platform();
  const a = arch();
  if (p === 'linux' && (a === 'x64' || a === 'arm64')) return `linux-${a}`;
  return null;
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const get = (u: string, redirects = 0) => {
      if (redirects > 8) {
        reject(new Error('Too many redirects'));
        return;
      }
      const lib = u.startsWith('https') ? https : http;
      const req = lib.get(u, { headers: { 'User-Agent': 'vamoos-ensure-python' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const out = createWriteStream(dest);
        pipeline(res, out).then(() => resolvePromise()).catch(reject);
      });
      req.on('error', reject);
    };
    get(url);
  });
}

async function installStandalone(): Promise<string> {
  const key = platformKey();
  if (!key || !STANDALONE[key]) {
    throw new Error(`No standalone Python for ${platform()}-${arch()}`);
  }
  const spec = STANDALONE[key];
  const base = resolve(tmpdir(), 'vamoos-python');
  mkdirSync(base, { recursive: true });
  const tarball = resolve(base, `cpython-${Date.now()}.tar.gz`);
  console.log(`[ensure-python] downloading standalone CPython (${key}) → ${base}`);
  await download(spec.url, tarball);

  const extractRoot = resolve(base, 'extract');
  try {
    execFileSync('rm', ['-rf', extractRoot], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  mkdirSync(extractRoot, { recursive: true });
  console.log('[ensure-python] extracting…');
  execFileSync('tar', ['-xzf', tarball, '-C', extractRoot], { stdio: 'inherit' });

  const bin = resolve(extractRoot, spec.binRel);
  if (!existsSync(bin)) {
    throw new Error(`Extracted Python missing at ${bin}`);
  }
  try {
    chmodSync(bin, 0o755);
  } catch {
    /* ignore */
  }
  if (!probe(bin)) {
    throw new Error(`Standalone Python failed to run: ${bin}`);
  }
  saveMarker(bin, base);
  // also try repo .tools for persistence across restarts when writable
  try {
    const tools = resolve(repoRoots()[0], '.tools');
    saveMarker(bin, tools);
  } catch {
    /* ignore */
  }
  return bin;
}

/** Resolve Python path; download portable CPython on Linux if needed. */
export async function ensurePython(): Promise<string | null> {
  if (cached !== undefined) return cached;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const existing = findExisting();
    if (existing) {
      cached = existing;
      process.env.PYTHON_PATH = existing;
      console.log(`[ensure-python] using ${existing}`);
      return existing;
    }
    if (platform() === 'win32') {
      cached = null;
      return null;
    }
    try {
      const bin = await installStandalone();
      cached = bin;
      process.env.PYTHON_PATH = bin;
      console.log(`[ensure-python] ok ${bin}`);
      return bin;
    } catch (err) {
      console.error(
        `[ensure-python] bootstrap failed: ${err instanceof Error ? err.message : err}`,
      );
      cached = null;
      return null;
    }
  })();

  try {
    return await bootPromise;
  } finally {
    bootPromise = null;
  }
}

/** Clear cached miss so a later bootstrap can retry. */
export function resetPythonCache(): void {
  cached = undefined;
}

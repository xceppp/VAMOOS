/**
 * Ensure a working Python 3 binary for Dixon-Coles on hosts without system Python.
 * Downloads a standalone CPython into .tools/python when needed.
 */
import { createWriteStream, existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { spawnSync, execFileSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import https from 'https';
import http from 'http';
import { tmpdir, platform, arch } from 'os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = resolve(root, '.tools');
const markerPath = resolve(toolsDir, 'python-bin.txt');
const extractDir = resolve(toolsDir, 'python');

const STANDALONE = {
  'linux-x64': {
    url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20260211/cpython-3.12.12%2B20260211-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz',
    bin: 'python/bin/python3',
  },
  'linux-arm64': {
    url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20260211/cpython-3.12.12%2B20260211-aarch64-unknown-linux-gnu-install_only_stripped.tar.gz',
    bin: 'python/bin/python3',
  },
};

function probe(bin) {
  if (!bin) return false;
  const args = bin.endsWith('py') || /(^|[\\/])py(\.exe)?$/i.test(bin) ? ['-3', '-c', 'print(1)'] : ['-c', 'print(1)'];
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 8000,
  });
  return r.status === 0;
}

function saveMarker(bin) {
  mkdirSync(toolsDir, { recursive: true });
  writeFileSync(markerPath, bin, 'utf8');
  console.log(`[ensure-python] using ${bin}`);
}

function readMarker() {
  if (!existsSync(markerPath)) return null;
  const bin = readFileSync(markerPath, 'utf8').trim();
  return bin && probe(bin) ? bin : null;
}

function findSystemPython() {
  const fromEnv = process.env.PYTHON_PATH?.trim() || process.env.PYTHON?.trim();
  const localStandalone = resolve(extractDir, 'bin', 'python3');
  const localStandaloneWin = resolve(extractDir, 'python.exe');
  const candidates = [
    fromEnv,
    readMarker(),
    localStandalone,
    localStandaloneWin,
    resolve(extractDir, 'bin', 'python'),
    'python3',
    'python',
    'py',
  ].filter(Boolean);

  for (const bin of candidates) {
    if (probe(bin)) return bin;
  }
  return null;
}

function platformKey() {
  const p = platform();
  const a = arch();
  if (p === 'linux' && (a === 'x64' || a === 'arm64')) return `linux-${a}`;
  return null;
}

function download(url, dest) {
  return new Promise((resolvePromise, reject) => {
    const get = (u, redirects = 0) => {
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
        pipeline(res, out).then(resolvePromise).catch(reject);
      });
      req.on('error', reject);
    };
    get(url);
  });
}

async function installStandalone() {
  const key = platformKey();
  if (!key || !STANDALONE[key]) {
    throw new Error(
      `No standalone Python for ${platform()}-${arch()}. Install Python 3 or set PYTHON_PATH.`,
    );
  }
  const spec = STANDALONE[key];
  mkdirSync(toolsDir, { recursive: true });
  const tarball = resolve(tmpdir(), `vamoos-cpython-${Date.now()}.tar.gz`);
  console.log(`[ensure-python] downloading standalone CPython (${key})…`);
  await download(spec.url, tarball);

  // extract into .tools (archive root is "python/")
  if (existsSync(extractDir)) {
    try {
      execFileSync('rm', ['-rf', extractDir], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  }
  mkdirSync(toolsDir, { recursive: true });
  console.log('[ensure-python] extracting…');
  execFileSync('tar', ['-xzf', tarball, '-C', toolsDir], { stdio: 'inherit' });

  const bin = resolve(toolsDir, spec.bin);
  if (!existsSync(bin)) {
    throw new Error(`Extracted Python missing at ${bin}`);
  }
  try {
    chmodSync(bin, 0o755);
  } catch {
    /* ignore */
  }
  if (!probe(bin)) {
    throw new Error(`Standalone Python at ${bin} failed to run`);
  }
  return bin;
}

export async function ensurePython() {
  const existing = findSystemPython();
  if (existing) {
    saveMarker(existing);
    process.env.PYTHON_PATH = existing;
    return existing;
  }

  if (platform() === 'win32') {
    throw new Error('Python not found. Install Python 3 from python.org and retry.');
  }

  const bin = await installStandalone();
  saveMarker(bin);
  process.env.PYTHON_PATH = bin;
  return bin;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  ensurePython()
    .then((bin) => {
      console.log(`[ensure-python] ok ${bin}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[ensure-python] ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    });
}

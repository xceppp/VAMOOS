import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ensurePython, resetPythonCache } from './ensurePython.js';
import {
  fetchFootballFeed,
  fetchUpcomingFeedMatches,
  providerIdToNumber,
  type LiveFeedMatch,
} from './liveFeed.js';
import { matchCrowdScore } from './popularity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DixonMarketSide {
  pick: string;
  side?: string;
  team?: string | null;
  prob: number;
  home?: number;
  draw?: number;
  away?: number;
  over?: number;
  under?: number;
  yes?: number;
  no?: number;
  anyGoal?: number;
}

export interface DixonMarkets {
  result: DixonMarketSide;
  moreGoals: DixonMarketSide;
  over15: DixonMarketSide;
  over25: DixonMarketSide;
  over35: DixonMarketSide;
  btts: DixonMarketSide;
  nextGoal: DixonMarketSide | null;
}

export interface DixonPick {
  id: string;
  liveId?: number;
  league: string;
  slug?: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  kickoff?: string | null;
  status?: string;
  minute?: number | null;
  score?: string;
  matchedTeams?: boolean;
  pick: string;
  confidence: number;
  confidenceRaw?: number;
  mostLikelyScore: string;
  potential: string;
  heat: number;
  expectedGoals: { home: number; away: number; total: number };
  expectedRemaining?: { home: number; away: number; total: number };
  prob: {
    home: number;
    draw: number;
    away: number;
    over15: number;
    over25: number;
    over35: number;
    btts: number;
  };
  markets?: DixonMarkets;
  model: 'dixon-coles-elo';
  bucket: 'live' | 'upcoming';
}

export interface DixonBoard {
  at: string;
  model: 'dixon-coles-elo';
  live: DixonPick[];
  upcoming: DixonPick[];
  skipped: number;
  notice: string | null;
}

const CACHE_MS = 45_000;
let cache: { at: number; data: DixonBoard } | null = null;
let resolvedPython: string | null | undefined;

function predictorRoot(): string {
  const candidates = [
    resolve(__dirname, '../../predictor'),
    resolve(process.cwd(), 'apps/predictor'),
    resolve(process.cwd(), 'predictor'),
  ];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, 'serve_batch.py'))) return dir;
  }
  return candidates[0];
}

function syncProbePython(): string | null {
  const fromEnv = process.env.PYTHON_PATH?.trim() || process.env.PYTHON?.trim();
  const candidates = [
    ...(fromEnv ? [fromEnv] : []),
    'python3',
    'python',
    'py',
  ];

  for (const bin of candidates) {
    const isPyLauncher = bin === 'py' || /(^|[\\/])py(\.exe)?$/i.test(bin);
    const args = isPyLauncher ? ['-3', '-c', 'print(1)'] : ['-c', 'print(1)'];
    const probe = spawnSync(bin, args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    if (probe.status === 0) {
      return isPyLauncher ? 'py' : bin;
    }
  }
  return null;
}

async function pythonBin(): Promise<string | null> {
  if (resolvedPython !== undefined && resolvedPython !== null) return resolvedPython;
  if (resolvedPython === null) {
    // previously missed — still try bootstrap once more via ensurePython
  }

  const quick = syncProbePython();
  if (quick) {
    resolvedPython = quick;
    return quick;
  }

  resetPythonCache();
  const boot = await ensurePython();
  resolvedPython = boot;
  return boot;
}

function pythonArgs(bin: string, script: string): string[] {
  if (bin === 'py') return ['-3', script];
  return [script];
}

function isInPlay(m: LiveFeedMatch): boolean {
  return m.status === 'LIVE' || m.status === 'HT' || m.status === 'ET' || m.statusCode === 2;
}

async function runPythonBatch(
  matches: Array<Record<string, unknown>>,
): Promise<{
  results: Omit<DixonPick, 'bucket'>[];
  skipped: Array<{ id?: string; reason?: string }>;
  error?: string;
}> {
  const script = resolve(predictorRoot(), 'serve_batch.py');
  if (!existsSync(script)) {
    return {
      results: [],
      skipped: [],
      error: `Predictor script missing at ${script}`,
    };
  }

  const bin = await pythonBin();
  if (!bin) {
    return {
      results: [],
      skipped: [],
      error:
        'Python not found after bootstrap. Check deploy logs for [ensure-python] download/extract errors.',
    };
  }

  return new Promise((resolvePromise) => {
    const child = spawn(bin, pythonArgs(bin, script), {
      cwd: predictorRoot(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHON_PATH: bin, PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolvePromise({ results: [], skipped: [], error: 'Predictor timed out' });
    }, 90_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvedPython = undefined;
      const code = (err as NodeJS.ErrnoException).code;
      resolvePromise({
        results: [],
        skipped: [],
        error:
          code === 'ENOENT'
            ? `spawn ${bin} ENOENT — bootstrap path invalid`
            : err.message || 'Failed to start Python',
      });
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout || '{}') as {
          results?: Omit<DixonPick, 'bucket'>[];
          skipped?: Array<{ id?: string; reason?: string }>;
          error?: string;
        };
        if (parsed.error) {
          resolvePromise({
            results: [],
            skipped: parsed.skipped ?? [],
            error: parsed.error,
          });
          return;
        }
        resolvePromise({
          results: Array.isArray(parsed.results) ? parsed.results : [],
          skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [],
          error: stderr && !parsed.results?.length ? stderr.slice(0, 200) : undefined,
        });
      } catch {
        resolvePromise({
          results: [],
          skipped: [],
          error: stderr.trim() || 'Invalid predictor output',
        });
      }
    });

    child.stdin.write(JSON.stringify({ matches }));
    child.stdin.end();
  });
}

function riskFromConfidence(c: number): 'green' | 'orange' | 'red' {
  if (c >= 0.58) return 'green';
  if (c >= 0.48) return 'orange';
  return 'red';
}

export function dixonRisk(p: DixonPick): 'green' | 'orange' | 'red' {
  return riskFromConfidence(p.confidence);
}

export async function buildDixonBoard(opts?: { force?: boolean }): Promise<DixonBoard> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }

  const liveFeed = await fetchFootballFeed();
  const liveMatches = liveFeed.filter(isInPlay);

  const upcomingPack = await fetchUpcomingFeedMatches(
    (input) =>
      matchCrowdScore({
        league: input.league,
        homeName: input.homeName,
        awayName: input.awayName,
      }),
    2,
  );

  const upcomingLive: LiveFeedMatch[] = [];
  // Prefer raw feed NS matches for today (richer league names) + convert upcoming days
  for (const m of liveFeed) {
    if (m.status === 'NS') upcomingLive.push(m);
  }

  const payload: Array<Record<string, unknown>> = [];
  const bucketById = new Map<string, 'live' | 'upcoming'>();

  for (const m of liveMatches.slice(0, 60)) {
    const id = m.id;
    bucketById.set(id, 'live');
    payload.push({
      id,
      liveId: providerIdToNumber(m.id),
      home: m.home,
      away: m.away,
      homeLogo: m.homeLogo,
      awayLogo: m.awayLogo,
      league: m.league,
      kickoff: m.kickoffTs ? new Date(m.kickoffTs * 1000).toISOString() : null,
      status: m.status,
      minute: m.minute,
      score: `${m.homeGoals}-${m.awayGoals}`,
    });
  }

  // Upcoming from fixtures API days (already LiveMatch[]) — map back to names
  for (const day of upcomingPack.days) {
    for (const m of day.matches.slice(0, 40)) {
      const id = m.providerId || String(m.id);
      if (bucketById.has(id)) continue;
      bucketById.set(id, 'upcoming');
      payload.push({
        id,
        liveId: m.id,
        home: m.home.name,
        away: m.away.name,
        homeLogo: m.home.logo,
        awayLogo: m.away.logo,
        league: m.league,
        kickoff: m.kickoff ?? null,
        status: m.status,
        minute: null,
        score: null,
      });
    }
  }

  // Also include NS from today's live feed not already in upcoming
  for (const m of upcomingLive.slice(0, 40)) {
    if (bucketById.has(m.id)) continue;
    bucketById.set(m.id, 'upcoming');
    payload.push({
      id: m.id,
      liveId: providerIdToNumber(m.id),
      home: m.home,
      away: m.away,
      homeLogo: m.homeLogo,
      awayLogo: m.awayLogo,
      league: m.league,
      kickoff: m.kickoffTs ? new Date(m.kickoffTs * 1000).toISOString() : null,
      status: 'NS',
      minute: null,
      score: null,
    });
  }

  const batch = await runPythonBatch(payload);
  const live: DixonPick[] = [];
  const upcoming: DixonPick[] = [];

  for (const r of batch.results) {
    const bucket = bucketById.get(r.id) ?? 'upcoming';
    const pick: DixonPick = { ...r, bucket, model: 'dixon-coles-elo' };
    if (bucket === 'live') live.push(pick);
    else upcoming.push(pick);
  }

  live.sort((a, b) => b.heat - a.heat || b.confidence - a.confidence);
  upcoming.sort((a, b) => b.heat - a.heat || b.confidence - a.confidence);

  let notice: string | null = null;
  if (batch.error) {
    notice = `Dixon-Coles engine unavailable (${batch.error})`;
  } else if (!live.length && !upcoming.length) {
    notice =
      batch.skipped.length > 0
        ? `No Dixon-Coles packs matched current fixtures (${batch.skipped.length} skipped). Covered: PL, La Liga, Serie A, Bundesliga, Ligue 1, MLS, Liga MX, UCL.`
        : 'No live or upcoming matches to score right now.';
  }

  const data: DixonBoard = {
    at: new Date().toISOString(),
    model: 'dixon-coles-elo',
    live,
    upcoming,
    skipped: batch.skipped.length,
    notice,
  };
  cache = { at: Date.now(), data };
  return data;
}

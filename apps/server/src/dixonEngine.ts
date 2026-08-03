/**
 * Pure TypeScript Dixon-Coles + Elo board engine.
 * Reads offline league packs from apps/predictor/data/leagues — no Python required.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LEAGUE_ALIASES: Record<string, string> = {
  mls: 'mls',
  'major league soccer': 'mls',
  'usa major league soccer': 'mls',
  'premier league': 'premier_league',
  'england premier league': 'premier_league',
  'english premier league': 'premier_league',
  epl: 'premier_league',
  pl: 'premier_league',
  'la liga': 'la_liga',
  laliga: 'la_liga',
  'spain la liga': 'la_liga',
  spain: 'la_liga',
  'serie a': 'serie_a',
  'italy serie a': 'serie_a',
  italy: 'serie_a',
  bundesliga: 'bundesliga',
  'germany bundesliga': 'bundesliga',
  germany: 'bundesliga',
  'ligue 1': 'ligue_1',
  'france ligue 1': 'ligue_1',
  france: 'ligue_1',
  'liga mx': 'liga_mx',
  'mexico liga mx': 'liga_mx',
  mexico: 'liga_mx',
  ucl: 'ucl',
  'champions league': 'ucl',
  'uefa champions league': 'ucl',
  'europe champions league': 'ucl',
};

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

export interface DixonEnginePick {
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
  score?: string | null;
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
  markets: DixonMarkets;
  model: 'dixon-coles-elo';
}

interface PackTeam {
  id: number;
  name: string;
  attack: number;
  defense: number;
  elo: number;
  attack_home?: number;
  attack_away?: number;
  defense_home?: number;
  defense_away?: number;
  availability_penalty?: number;
  key_absences?: string[];
}

interface LeaguePack {
  name?: string;
  teams: PackTeam[];
  calibration?: {
    rho?: number;
    home_advantage?: number;
    scoring_variance?: number;
    parity?: number;
    max_displayed_confidence?: number;
  };
}

interface MatchInput {
  id: string;
  liveId?: number;
  home: string;
  away: string;
  league: string;
  homeLogo?: string;
  awayLogo?: string;
  kickoff?: string | null;
  status?: string;
  minute?: number | null;
  score?: string | null;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonPmf(k: number, lam: number): number {
  if (lam <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lam) * lam ** k / factorial(k);
}

function dixonColesTau(i: number, j: number, lamH: number, lamA: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lamH * lamA * rho;
  if (i === 0 && j === 1) return 1 + lamH * rho;
  if (i === 1 && j === 0) return 1 + lamA * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|united|city|club)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function packsDir(): string {
  const candidates = [
    resolve(__dirname, '../../predictor/data/leagues'),
    resolve(process.cwd(), 'apps/predictor/data/leagues'),
    resolve(process.cwd(), 'predictor/data/leagues'),
  ];
  for (const d of candidates) {
    if (existsSync(d)) return d;
  }
  return candidates[0];
}

const packCache = new Map<string, LeaguePack>();

function loadPack(slug: string): LeaguePack | null {
  if (packCache.has(slug)) return packCache.get(slug)!;
  const path = resolve(packsDir(), `${slug}.json`);
  if (!existsSync(path)) return null;
  const pack = JSON.parse(readFileSync(path, 'utf8')) as LeaguePack;
  packCache.set(slug, pack);
  return pack;
}

export function resolveLeagueSlug(league: string): string | null {
  const raw = (league || '').trim();
  if (!raw) return null;
  const parts = raw.split(/\s*[-–|/]\s*/);
  const candidates = [raw, parts[parts.length - 1] || raw, parts[0] || raw];
  const slugs = new Set(Object.values(LEAGUE_ALIASES));

  for (const c of candidates) {
    const key = c.trim().toLowerCase().replace(/[-_]/g, ' ');
    const slugKey = c.trim().toLowerCase().replace(/[-\s]/g, '_');
    if (slugs.has(slugKey)) return slugKey;
    if (LEAGUE_ALIASES[key]) return LEAGUE_ALIASES[key];
    for (const [alias, slug] of Object.entries(LEAGUE_ALIASES)) {
      if (key.includes(alias) || alias.includes(key)) return slug;
    }
  }
  return null;
}

function findTeam(name: string, teams: PackTeam[]): PackTeam | null {
  const n = normName(name);
  if (!n) return null;
  const exact = teams.find((t) => normName(t.name) === n);
  if (exact) return exact;
  let best: PackTeam | null = null;
  let bestLen = 0;
  for (const t of teams) {
    const tn = normName(t.name);
    if (!tn) continue;
    if (n.includes(tn) || tn.includes(n)) {
      const score = Math.min(n.length, tn.length);
      if (score > bestLen) {
        best = t;
        bestLen = score;
      }
    }
  }
  return best;
}

function calibrateProb(raw: number, maxConf: number): number {
  const r = clamp(raw, 0, 0.999);
  const shrunk = 0.5 + (r - 0.5) * 0.82;
  return clamp(Math.min(shrunk, maxConf), 0, maxConf);
}

function expectedGoals(
  home: PackTeam,
  away: PackTeam,
  cal: { rho: number; homeAdv: number; variance: number; parity: number },
): { lamH: number; lamA: number } {
  const avgH = 1.35;
  const avgA = 1.15;
  const attH = home.attack_home ?? home.attack * 1.05;
  const attA = away.attack_away ?? away.attack * 0.95;
  const defH = home.defense_home ?? home.defense * 0.95;
  const defA = away.defense_away ?? away.defense * 1.05;

  let lamH = avgH * attH * defA * cal.homeAdv;
  let lamA = avgA * attA * defH;

  if (cal.parity !== 1) {
    const blend = clamp(cal.parity - 1, 0, 0.45);
    lamH = lamH * (1 - blend) + avgH * cal.homeAdv * blend;
    lamA = lamA * (1 - blend) + avgA * blend;
  }

  if (cal.variance !== 1) {
    const mid = (lamH + lamA) / 2;
    lamH = mid + (lamH - mid) * cal.variance;
    lamA = mid + (lamA - mid) * cal.variance;
    const scale = clamp(cal.variance, 0.75, 1.35);
    lamH *= scale;
    lamA *= scale;
  }

  const eloDiff = home.elo - away.elo;
  const eloScale = 800 * clamp(cal.parity, 0.75, 1.4);
  const eloFactor = clamp(1 + eloDiff / eloScale, 0.78, 1.28);
  lamH *= eloFactor;
  lamA *= 2 - eloFactor;

  for (const [team, isHome] of [
    [home, true],
    [away, false],
  ] as const) {
    let pen = clamp(team.availability_penalty ?? 0, 0, 1);
    if ((team.key_absences?.length ?? 0) > 0 && pen <= 0) {
      pen = Math.min(0.12 * (team.key_absences?.length ?? 0), 0.35);
    }
    if (pen > 0) {
      const factor = 1 - 0.35 * pen;
      if (isHome) {
        lamH *= factor;
        lamA *= 1 + 0.08 * pen;
      } else {
        lamA *= factor;
        lamH *= 1 + 0.08 * pen;
      }
    }
  }

  return { lamH: clamp(lamH, 0.3, 3.8), lamA: clamp(lamA, 0.22, 3.4) };
}

function scorelineMatrix(lamH: number, lamA: number, rho: number, maxGoals = 8): number[][] {
  const grid: number[][] = Array.from({ length: maxGoals + 1 }, () =>
    Array(maxGoals + 1).fill(0),
  );
  let total = 0;
  for (let i = 0; i <= maxGoals; i++) {
    const pi = poissonPmf(i, lamH);
    for (let j = 0; j <= maxGoals; j++) {
      const p = Math.max(0, pi * poissonPmf(j, lamA) * dixonColesTau(i, j, lamH, lamA, rho));
      grid[i][j] = p;
      total += p;
    }
  }
  if (total > 0) {
    for (let i = 0; i <= maxGoals; i++) {
      for (let j = 0; j <= maxGoals; j++) grid[i][j] /= total;
    }
  }
  return grid;
}

function remainingFraction(minute: number | null | undefined, status: string | null | undefined): number {
  const st = (status || '').toUpperCase();
  if (st === 'HT') return 0.5;
  if (minute == null) return 1;
  const m = Math.max(0, Math.min(Number(minute), 120));
  if (st === 'ET' || m > 90) return Math.max(0.05, (120 - m) / 30) * 0.25;
  return Math.max(0.08, (90 - m) / 90);
}

function parseScore(score: string | null | undefined): [number, number] | null {
  if (!score) return null;
  const parts = score.replace(':', '-').split('-');
  if (parts.length !== 2) return null;
  const a = Number(parts[0].trim());
  const b = Number(parts[1].trim());
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

function liveResidual(
  lamH: number,
  lamA: number,
  hg: number,
  ag: number,
  remFrac: number,
): Record<string, number> {
  const rh = Math.max(0.01, lamH * remFrac);
  const ra = Math.max(0.01, lamA * remFrac);
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pBtts = 0;
  let pO15 = 0;
  let pO25 = 0;
  let pO35 = 0;
  const maxExtra = 8;
  for (let i = 0; i <= maxExtra; i++) {
    const pi = poissonPmf(i, rh);
    for (let j = 0; j <= maxExtra; j++) {
      const p = pi * poissonPmf(j, ra);
      const fh = hg + i;
      const fa = ag + j;
      const total = fh + fa;
      if (fh > fa) pHome += p;
      else if (fh === fa) pDraw += p;
      else pAway += p;
      if (fh > 0 && fa > 0) pBtts += p;
      if (total >= 2) pO15 += p;
      if (total >= 3) pO25 += p;
      if (total >= 4) pO35 += p;
    }
  }
  const s = pHome + pDraw + pAway;
  if (s > 0) {
    pHome /= s;
    pDraw /= s;
    pAway /= s;
  }
  return {
    p_home: pHome,
    p_draw: pDraw,
    p_away: pAway,
    p_btts: pBtts,
    p_over_15: pO15,
    p_over_25: pO25,
    p_over_35: pO35,
    rem_home: rh,
    rem_away: ra,
    p_next_home: rh / (rh + ra),
    p_next_away: ra / (rh + ra),
    p_any_goal: 1 - Math.exp(-(rh + ra)),
  };
}

function ouPick(over: number, line: string): DixonMarketSide {
  const under = Math.max(0, 1 - over);
  if (over >= under) {
    return { pick: `OVER ${line}`, side: 'over', prob: over, over, under };
  }
  return { pick: `UNDER ${line}`, side: 'under', prob: under, over, under };
}

function buildMarkets(args: {
  homeName: string;
  awayName: string;
  lamH: number;
  lamA: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pBtts: number;
  pO15: number;
  pO25: number;
  pO35: number;
  score?: string | null;
  minute?: number | null;
  status?: string;
  maxConf: number;
}): {
  pick: string;
  confidence: number;
  confidenceRaw: number;
  markets: DixonMarkets;
  prob: DixonEnginePick['prob'];
  expectedRemaining: { home: number; away: number; total: number };
} {
  let { pHome, pDraw, pAway, pBtts, pO15, pO25, pO35 } = args;
  let remH = args.lamH;
  let remA = args.lamA;
  let nextGoal: DixonMarketSide | null = null;

  const scored = parseScore(args.score);
  const st = (args.status || '').toUpperCase();
  const isLive =
    scored != null &&
    (['LIVE', 'HT', 'ET', '1H', '2H'].includes(st) || args.minute != null);

  if (isLive && scored) {
    const live = liveResidual(args.lamH, args.lamA, scored[0], scored[1], remainingFraction(args.minute, args.status));
    pHome = live.p_home;
    pDraw = live.p_draw;
    pAway = live.p_away;
    pBtts = live.p_btts;
    pO15 = live.p_over_15;
    pO25 = live.p_over_25;
    pO35 = live.p_over_35;
    remH = live.rem_home;
    remA = live.rem_away;
    const nextSide = live.p_next_home >= live.p_next_away ? 'home' : 'away';
    const team = nextSide === 'home' ? args.homeName : args.awayName;
    const nextProb = nextSide === 'home' ? live.p_next_home : live.p_next_away;
    nextGoal = {
      pick: `NEXT GOAL · ${team}`,
      side: nextSide,
      team,
      prob: round4(nextProb),
      anyGoal: round4(live.p_any_goal),
      home: round4(live.p_next_home),
      away: round4(live.p_next_away),
    };
  }

  let side: 'home' | 'draw' | 'away' = 'draw';
  let resultLabel = 'DRAW';
  let resultProb = pDraw;
  if (pHome >= pDraw && pHome >= pAway) {
    side = 'home';
    resultLabel = 'HOME WIN';
    resultProb = pHome;
  } else if (pAway >= pDraw && pAway >= pHome) {
    side = 'away';
    resultLabel = 'AWAY WIN';
    resultProb = pAway;
  }

  const result: DixonMarketSide = {
    pick: resultLabel,
    side,
    prob: round4(resultProb),
    home: round4(pHome),
    draw: round4(pDraw),
    away: round4(pAway),
  };

  const more: DixonMarketSide =
    side === 'draw'
      ? { pick: 'EQUAL GOALS', side: 'draw', team: null, prob: round4(pDraw) }
      : {
          pick: `MORE GOALS · ${side === 'home' ? args.homeName : args.awayName}`,
          side,
          team: side === 'home' ? args.homeName : args.awayName,
          prob: round4(resultProb),
        };

  const over15 = ouPick(pO15, '1.5');
  const over25 = ouPick(pO25, '2.5');
  const over35 = ouPick(pO35, '3.5');
  const bttsYes = pBtts;
  const bttsNo = 1 - pBtts;
  const btts: DixonMarketSide =
    bttsYes >= bttsNo
      ? { pick: 'BTTS YES', side: 'yes', prob: round4(bttsYes), yes: round4(bttsYes), no: round4(bttsNo) }
      : { pick: 'BTTS NO', side: 'no', prob: round4(bttsNo), yes: round4(bttsYes), no: round4(bttsNo) };

  const open = (p: number) => p > 0.02 && p < 0.98;
  const candidates: Array<[string, number]> = [];
  if (open(result.prob)) candidates.push([result.pick, result.prob]);
  if (open(more.prob)) candidates.push([more.pick, more.prob]);
  if (open(over25.prob)) candidates.push([over25.pick, over25.prob]);
  if (open(over35.prob)) candidates.push([over35.pick, over35.prob]);
  if (open(btts.prob)) candidates.push([btts.pick, btts.prob]);
  if (nextGoal && (nextGoal.anyGoal ?? 0) >= 0.25 && open(nextGoal.prob)) {
    candidates.push([nextGoal.pick, nextGoal.prob]);
  }
  if (!candidates.length) {
    candidates.push([result.pick, result.prob], [over25.pick, over25.prob], [btts.pick, btts.prob]);
  }
  candidates.sort((a, b) => b[1] - a[1]);
  const [tip, tipRaw] = candidates[0];

  return {
    pick: tip,
    confidence: round4(calibrateProb(tipRaw, args.maxConf)),
    confidenceRaw: round4(tipRaw),
    markets: { result, moreGoals: more, over15, over25, over35, btts, nextGoal },
    prob: {
      home: round4(pHome),
      draw: round4(pDraw),
      away: round4(pAway),
      over15: round4(pO15),
      over25: round4(pO25),
      over35: round4(pO35),
      btts: round4(pBtts),
    },
    expectedRemaining: {
      home: round3(remH),
      away: round3(remA),
      total: round3(remH + remA),
    },
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function potentialLabel(pO25: number, pO35: number, pBtts: number): string {
  const bits: string[] = [];
  if (pO35 >= 0.4) bits.push('HIGH O3.5');
  else if (pO25 >= 0.55) bits.push('HIGH O2.5');
  else if (pO25 >= 0.48) bits.push('O2.5 lean');
  else bits.push('Low goals');
  if (pBtts >= 0.58) bits.push('BTTS strong');
  else if (pBtts >= 0.5) bits.push('BTTS ok');
  else bits.push('BTTS weak');
  return bits.join(' + ');
}

function heatScore(pO15: number, pO25: number, pO35: number, pBtts: number): number {
  return 0.3 * pO25 + 0.2 * pO35 + 0.15 * pO15 + 0.3 * pBtts;
}

function predictOne(m: MatchInput, nextSynth: { n: number }): DixonEnginePick | { skip: string } {
  const slug = resolveLeagueSlug(m.league);
  if (!slug) return { skip: `no league pack for '${m.league}'` };
  const pack = loadPack(slug);
  if (!pack) return { skip: `pack missing: ${slug}` };

  const cfg = pack.calibration || {};
  const cal = {
    rho: Number(cfg.rho ?? -0.1),
    homeAdv: Number(cfg.home_advantage ?? 1.12),
    variance: Number(cfg.scoring_variance ?? 1),
    parity: Number(cfg.parity ?? 1),
    maxConf: Number(cfg.max_displayed_confidence ?? 0.72),
  };

  const teams = pack.teams || [];
  let home = findTeam(m.home, teams);
  let away = findTeam(m.away, teams);
  const matched = Boolean(home && away);

  if (!home) {
    home = {
      id: nextSynth.n++,
      name: m.home,
      attack: 1,
      defense: 1,
      elo: 1500,
    };
  }
  if (!away) {
    away = {
      id: nextSynth.n++,
      name: m.away,
      attack: 1,
      defense: 1,
      elo: 1500,
    };
  }

  const { lamH, lamA } = expectedGoals(home, away, cal);
  const grid = scorelineMatrix(lamH, lamA, cal.rho);

  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pBtts = 0;
  let pO15 = 0;
  let pO25 = 0;
  let pO35 = 0;
  let bestScore = '0-0';
  let bestP = -1;

  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const p = grid[i][j];
      const total = i + j;
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i > 0 && j > 0) pBtts += p;
      if (total >= 2) pO15 += p;
      if (total >= 3) pO25 += p;
      if (total >= 4) pO35 += p;
      if (p > bestP) {
        bestP = p;
        bestScore = `${i}-${j}`;
      }
    }
  }
  const s = pHome + pDraw + pAway;
  if (s > 0) {
    pHome /= s;
    pDraw /= s;
    pAway /= s;
  }

  const board = buildMarkets({
    homeName: m.home,
    awayName: m.away,
    lamH,
    lamA,
    pHome,
    pDraw,
    pAway,
    pBtts,
    pO15,
    pO25,
    pO35,
    score: m.score,
    minute: m.minute,
    status: m.status,
    maxConf: cal.maxConf,
  });

  return {
    id: String(m.id),
    liveId: m.liveId,
    league: m.league || pack.name || slug,
    slug,
    home: m.home,
    away: m.away,
    homeLogo: m.homeLogo,
    awayLogo: m.awayLogo,
    kickoff: m.kickoff ?? null,
    status: m.status,
    minute: m.minute ?? null,
    score: m.score ?? null,
    matchedTeams: matched,
    pick: board.pick,
    confidence: board.confidence,
    confidenceRaw: board.confidenceRaw,
    mostLikelyScore: bestScore,
    potential: potentialLabel(pO25, pO35, pBtts),
    heat: round4(heatScore(pO15, pO25, pO35, pBtts)),
    expectedGoals: {
      home: round3(lamH),
      away: round3(lamA),
      total: round3(lamH + lamA),
    },
    expectedRemaining: board.expectedRemaining,
    prob: board.prob,
    markets: board.markets,
    model: 'dixon-coles-elo',
  };
}

export function runDixonBatch(matches: MatchInput[]): {
  results: DixonEnginePick[];
  skipped: Array<{ id?: string; reason?: string }>;
  error?: string;
} {
  const dir = packsDir();
  if (!existsSync(dir)) {
    return {
      results: [],
      skipped: [],
      error: `League packs missing at ${dir}`,
    };
  }

  const results: DixonEnginePick[] = [];
  const skipped: Array<{ id?: string; reason?: string }> = [];
  const nextSynth = { n: 90_000 };

  for (const m of matches) {
    if (!m.id || !m.home || !m.away) {
      skipped.push({ id: m.id, reason: 'missing fields' });
      continue;
    }
    const out = predictOne(m, nextSynth);
    if ('skip' in out) {
      skipped.push({ id: m.id, reason: out.skip });
      continue;
    }
    results.push(out);
  }

  results.sort((a, b) => b.heat - a.heat || b.confidence - a.confidence);
  return { results, skipped };
}

export function listAvailablePacks(): string[] {
  const dir = packsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

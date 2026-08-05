/** Tiny module caches so first paint after remount (StrictMode) isn't blank. */

import type { LiveMatch } from '../types';

export interface FixturesDayCache {
  dayOffset: number;
  matches: LiveMatch[];
}

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

export interface DixonPickCache {
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
  topScores?: Array<{ score: string; prob: number }>;
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

export interface LiveHeatPickCache {
  id: string;
  liveId: number;
  league: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  score: string;
  minute: number;
  status: string;
  cornersHome: number;
  cornersAway: number;
  cornersTotal: number;
  pNextCorner: number;
  expectedExtraCorners: number;
  cornerPick: string;
  cornerConfidence: number;
  cornerRisk: 'green' | 'orange' | 'red';
  heatCorners: number;
  shotsOnHome: number;
  shotsOnAway: number;
  shotsOnTotal: number;
  pNextGoal: number;
  expectedExtraGoals: number;
  goalPick: string;
  goalConfidence: number;
  goalRisk: 'green' | 'orange' | 'red';
  heatShots: number;
  possession?: string;
}

export interface DixonBoardCache {
  at: string;
  model: 'dixon-coles-elo';
  live: DixonPickCache[];
  upcoming: DixonPickCache[];
  liveHeat?: {
    corners: LiveHeatPickCache[];
    shots: LiveHeatPickCache[];
    scanned: number;
    notice: string | null;
  };
  skipped: number;
  notice: string | null;
}

let fixturesCache: FixturesDayCache[] | null = null;
let dixonBoardCache: DixonBoardCache | null = null;

export function getFixturesCache(): FixturesDayCache[] | null {
  return fixturesCache;
}

export function setFixturesCache(days: FixturesDayCache[]): void {
  fixturesCache = days;
}

export function getDixonBoardCache(): DixonBoardCache | null {
  return dixonBoardCache;
}

export function setDixonBoardCache(board: DixonBoardCache): void {
  dixonBoardCache = board;
}

/** @deprecated kept for older imports */
export function getLateScanCache(): null {
  return null;
}

/** @deprecated */
export function setLateScanCache(_scan: unknown): void {
  /* no-op */
}

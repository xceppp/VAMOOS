/** Tiny module caches so first paint after remount (StrictMode) isn't blank. */

import type { LiveMatch } from '../types';

export interface FixturesDayCache {
  dayOffset: number;
  matches: LiveMatch[];
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
  potential: string;
  heat: number;
  expectedGoals: { home: number; away: number; total: number };
  prob: {
    home: number;
    draw: number;
    away: number;
    over15: number;
    over25: number;
    over35: number;
    btts: number;
  };
  model: 'dixon-coles-elo';
  bucket: 'live' | 'upcoming';
}

export interface DixonBoardCache {
  at: string;
  model: 'dixon-coles-elo';
  live: DixonPickCache[];
  upcoming: DixonPickCache[];
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

/** Tiny module caches so first paint after remount (StrictMode) isn't blank. */

import type { LiveMatch } from '../types';

export interface LatePickCache {
  matchId: string;
  liveId?: number;
  league: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  score: string;
  minute: number;
  status: string;
  url: string;
  pNextGoal: number;
  pNextCorner: number;
  call: 'BET' | 'NAH' | 'LEAN BET' | 'LEAN NAH';
  cornerCall: 'BET' | 'NAH' | 'LEAN BET' | 'LEAN NAH';
  corners: string;
  goalRisk: 'green' | 'orange' | 'red';
  cornerRisk: 'green' | 'orange' | 'red';
  risk?: 'green' | 'orange' | 'red';
}

export interface LateScanCache {
  at: string;
  liveTotal: number;
  lateWindowTotal: number;
  matches?: LatePickCache[];
  picks: LatePickCache[];
  watch: LatePickCache[];
  notice: string | null;
}

export interface FixturesDayCache {
  dayOffset: number;
  matches: LiveMatch[];
}

let lateScanCache: LateScanCache | null = null;
let fixturesCache: FixturesDayCache[] | null = null;

export function getLateScanCache(): LateScanCache | null {
  return lateScanCache;
}

export function setLateScanCache(scan: LateScanCache): void {
  lateScanCache = scan;
}

export function getFixturesCache(): FixturesDayCache[] | null {
  return fixturesCache;
}

export function setFixturesCache(days: FixturesDayCache[]): void {
  fixturesCache = days;
}

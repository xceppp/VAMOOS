import { fetchLiveFixtures } from './apiFootball.js';
import { getDemoMatches, tickDemoMatches } from './demo.js';
import { diffMatches, toMap } from './diff.js';
import { isRateLimitError } from './errors.js';
import {
  applyScorePulse,
  fetchFlashscoreLiveMatches,
  fetchMatchLiveOdds,
  fetchMatchScorePulse,
  fetchMatchStats,
} from './flashscore.js';
import { matchCrowdScore } from './popularity.js';
import type { LiveMatch, MatchOdds, MatchSideStats } from './types.js';
import type { WsHub } from './ws.js';

export interface PollerState {
  matches: LiveMatch[];
  mode: 'live' | 'demo' | 'cached';
  rateLimited: boolean;
  rateLimitedUntil: number | null;
  lastOkAt: string | null;
  notice: string | null;
  source: 'flashscore' | 'api-football' | 'demo';
  lastPulseAt: string | null;
}

function nextUtcMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5, 0);
}

function isInPlay(status: string): boolean {
  return ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status);
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

function sideStatsEqual(a?: MatchSideStats, b?: MatchSideStats): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.possessionHome === b.possessionHome &&
    a.possessionAway === b.possessionAway &&
    a.cornersHome === b.cornersHome &&
    a.cornersAway === b.cornersAway
  );
}

function oddsEqual(a?: MatchOdds, b?: MatchOdds): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a.home === b.home && a.draw === b.draw && a.away === b.away;
}

function carryBoardExtras(prevMatch: LiveMatch | undefined, next: LiveMatch): LiveMatch {
  if (!prevMatch) return next;
  return {
    ...next,
    homeFsTeamId: next.homeFsTeamId ?? prevMatch.homeFsTeamId,
    awayFsTeamId: next.awayFsTeamId ?? prevMatch.awayFsTeamId,
    stats: prevMatch.stats,
    odds: prevMatch.odds,
  };
}

export function startPoller(
  hub: WsHub,
  options: {
    apiKey?: string;
    intervalMs: number;
    pulseIntervalMs?: number;
    /** Possession / corners / odds refresh cadence */
    sideIntervalMs?: number;
    /** Default flashscore — free + fast. api-football as optional override. */
    source?: 'flashscore' | 'api-football';
  },
) {
  const source = options.source ?? 'flashscore';
  const pulseIntervalMs = options.pulseIntervalMs ?? 800;
  const sideIntervalMs = options.sideIntervalMs ?? 8_000;
  const state: PollerState = {
    matches: [],
    mode: 'live',
    rateLimited: false,
    rateLimitedUntil: null,
    lastOkAt: null,
    notice: null,
    source,
    lastPulseAt: null,
  };

  let prev = new Map<number, LiveMatch>();
  let started = false;
  let boardInFlight = false;
  let pulseInFlight = false;
  let sideInFlight = false;
  /** Round-robin cursor for side-stat enrichment across the live board. */
  let sideCursor = 0;
  /** Keeps recently seen matches so detail/stats still resolve after they leave the live list. */
  const recentById = new Map<number, LiveMatch>();
  /** Flashscore ids kept on the board briefly after FT so the final score is broadcast. */
  const retainUntil = new Map<string, number>();
  /** App match ids the client is watching (favorites) — pulsed first. */
  const watchIds = new Set<number>();
  const RETAIN_FT_MS = 20 * 60_000;
  const SIDE_BATCH = 18;

  function remember(matches: LiveMatch[]) {
    for (const m of matches) recentById.set(m.id, m);
    if (recentById.size > 800) {
      const keys = [...recentById.keys()];
      for (const k of keys.slice(0, keys.length - 600)) recentById.delete(k);
    }
  }

  function rememberOne(match: LiveMatch) {
    recentById.set(match.id, match);
  }

  function findMatch(id: number): LiveMatch | undefined {
    return state.matches.find((m) => m.id === id) ?? recentById.get(id);
  }

  function setWatchIds(ids: number[]) {
    watchIds.clear();
    for (const id of ids) {
      if (Number.isFinite(id)) watchIds.add(id);
    }
  }

  function snapshotPayload() {
    return {
      type: 'snapshot' as const,
      matches: state.matches,
      mode: state.mode === 'cached' ? ('live' as const) : state.mode,
      rateLimited: state.rateLimited,
      notice: state.notice,
      at: new Date().toISOString(),
    };
  }

  function broadcastSnapshot() {
    hub.broadcast(snapshotPayload());
  }

  function commitMatches(next: LiveMatch[], emitDiff: boolean) {
    const events = emitDiff && started ? diffMatches(prev, next) : [];
    prev = toMap(next);
    state.matches = next;
    remember(next);
    started = true;
    // Push goal events before the full snapshot so alerts fire ASAP.
    for (const event of events) {
      hub.broadcast({ type: 'event', event });
    }
    broadcastSnapshot();
    return events.length;
  }

  async function pullLive(): Promise<LiveMatch[]> {
    if (source === 'api-football') {
      if (!options.apiKey) {
        throw new Error('API_FOOTBALL_KEY required for api-football source');
      }
      return fetchLiveFixtures(options.apiKey);
    }
    const now = Date.now();
    for (const [id, until] of retainUntil) {
      if (until <= now) retainUntil.delete(id);
    }
    for (const m of prev.values()) {
      if (!m.flashscoreId) continue;
      if (m.status !== 'FT') {
        retainUntil.set(m.flashscoreId, now + RETAIN_FT_MS);
      } else if (!retainUntil.has(m.flashscoreId)) {
        retainUntil.set(m.flashscoreId, now + RETAIN_FT_MS);
      }
    }
    return fetchFlashscoreLiveMatches(
      (input) =>
        matchCrowdScore({
          league: input.league,
          homeName: input.homeName,
          awayName: input.awayName,
        }),
      retainUntil,
    );
  }

  async function tickBoard() {
    if (boardInFlight) return;
    if (
      source === 'api-football' &&
      state.rateLimited &&
      state.rateLimitedUntil != null &&
      Date.now() < state.rateLimitedUntil
    ) {
      broadcastSnapshot();
      return;
    }

    boardInFlight = true;
    try {
      let next: LiveMatch[];

      try {
        next = await pullLive();
        state.mode = 'live';
        state.source = source;
        state.rateLimited = false;
        state.rateLimitedUntil = null;
        state.notice = source === 'flashscore' ? 'Live from Flashscore' : null;
        state.lastOkAt = new Date().toISOString();
      } catch (err) {
        if (source === 'flashscore' && options.apiKey) {
          console.warn('[poller] Flashscore failed, trying API-Football', err);
          next = await fetchLiveFixtures(options.apiKey);
          state.mode = 'live';
          state.source = 'api-football';
          state.notice = 'Flashscore unavailable — using API-Football backup.';
          state.lastOkAt = new Date().toISOString();
        } else {
          throw err;
        }
      }

      // Preserve fresher pulse scores + side stats if the full feed is momentarily behind.
      next = next.map((m) => {
        const cur = prev.get(m.id);
        let merged = carryBoardExtras(cur, m);
        if (!cur) return merged;
        const curH = cur.goals.home ?? 0;
        const curA = cur.goals.away ?? 0;
        const nextH = m.goals.home ?? 0;
        const nextA = m.goals.away ?? 0;
        if (curH + curA > nextH + nextA) {
          merged = {
            ...merged,
            goals: cur.goals,
            status: cur.status,
            elapsed: cur.elapsed,
          };
        }
        return merged;
      });

      commitMatches(next, true);
    } catch (err) {
      console.error('[poller]', err);

      if (isRateLimitError(err)) {
        state.rateLimited = true;
        state.rateLimitedUntil = nextUtcMidnight();
        state.mode = state.matches.length ? 'cached' : 'demo';
        state.notice =
          'API daily limit reached. Showing last saved live scores until the quota resets.';
        if (!state.matches.length) {
          state.matches = getDemoMatches();
          prev = toMap(state.matches);
          state.mode = 'demo';
          state.source = 'demo';
          state.notice = 'API limit hit — demo matches shown.';
        }
        started = true;
        broadcastSnapshot();
        return;
      }

      if (!state.matches.length) {
        state.mode = 'demo';
        state.source = 'demo';
        state.matches = !started ? getDemoMatches() : tickDemoMatches().matches;
        prev = toMap(state.matches);
        state.notice =
          source === 'flashscore'
            ? 'Flashscore unreachable — demo matches.'
            : 'Live API unavailable — running demo matches.';
        started = true;
        broadcastSnapshot();
      } else {
        state.mode = 'cached';
        state.notice = 'Live refresh failed — keeping the last good snapshot.';
        broadcastSnapshot();
      }
    } finally {
      boardInFlight = false;
    }
  }

  /** Fast path: hit Flashscore's tiny per-match score feed for in-play games. */
  async function tickPulse() {
    if (pulseInFlight || source !== 'flashscore') return;
    if (!state.matches.length) return;

    pulseInFlight = true;
    try {
      const targets = state.matches
        .filter((m) => m.flashscoreId && isInPlay(m.status))
        .sort((a, b) => Number(watchIds.has(b.id)) - Number(watchIds.has(a.id)));

      if (!targets.length) return;

      const updated = new Map<number, LiveMatch>();

      await mapPool(targets, 20, async (m) => {
        const pulse = await fetchMatchScorePulse(m.flashscoreId!);
        if (!pulse) return;
        const next = applyScorePulse(m, pulse);
        const oldH = m.goals.home ?? 0;
        const oldA = m.goals.away ?? 0;
        const newH = next.goals.home ?? 0;
        const newA = next.goals.away ?? 0;
        if (newH === oldH && newA === oldA && next.status === m.status && next.elapsed === m.elapsed) {
          return;
        }
        updated.set(m.id, next);
      });

      if (!updated.size) {
        state.lastPulseAt = new Date().toISOString();
        return;
      }

      const next = state.matches.map((m) => updated.get(m.id) ?? m);
      state.lastPulseAt = new Date().toISOString();
      state.lastOkAt = state.lastPulseAt;
      commitMatches(next, true);
    } catch (err) {
      console.warn('[poller-pulse]', err);
    } finally {
      pulseInFlight = false;
    }
  }

  /** Slower path: possession, corners, live 1X2 odds for the main list. */
  async function tickSide() {
    if (sideInFlight || source !== 'flashscore') return;
    if (!state.matches.length) return;

    sideInFlight = true;
    try {
      const inPlay = state.matches.filter((m) => m.flashscoreId && isInPlay(m.status));
      if (!inPlay.length) return;

      const watched = inPlay.filter((m) => watchIds.has(m.id));
      const rest = inPlay.filter((m) => !watchIds.has(m.id));
      const rotated = [
        ...rest.slice(sideCursor % Math.max(rest.length, 1)),
        ...rest.slice(0, sideCursor % Math.max(rest.length, 1)),
      ];
      sideCursor = (sideCursor + SIDE_BATCH) % Math.max(rest.length, 1);

      const budget = Math.max(0, SIDE_BATCH - watched.length);
      const targets = [...watched, ...rotated.slice(0, budget)];
      if (!targets.length) return;

      const updated = new Map<number, LiveMatch>();

      await mapPool(targets, 6, async (m) => {
        const fsId = m.flashscoreId!;
        const [stats, odds] = await Promise.all([
          fetchMatchStats(fsId),
          fetchMatchLiveOdds(fsId, m.homeFsTeamId, m.awayFsTeamId),
        ]);

        const nextStats: MatchSideStats | undefined = stats
          ? {
              possessionHome: stats.possessionHome,
              possessionAway: stats.possessionAway,
              cornersHome: stats.cornersHome,
              cornersAway: stats.cornersAway,
            }
          : m.stats;
        const nextOdds: MatchOdds | undefined = odds
          ? { home: odds.home, draw: odds.draw, away: odds.away }
          : m.odds;

        if (sideStatsEqual(m.stats, nextStats) && oddsEqual(m.odds, nextOdds)) return;

        updated.set(m.id, {
          ...m,
          stats: nextStats,
          odds: nextOdds,
        });
      });

      if (!updated.size) return;

      const next = state.matches.map((m) => updated.get(m.id) ?? m);
      // Side-board refresh shouldn't emit goal diffs — scores unchanged.
      prev = toMap(next);
      state.matches = next;
      remember(next);
      broadcastSnapshot();
    } catch (err) {
      console.warn('[poller-side]', err);
    } finally {
      sideInFlight = false;
    }
  }

  hub.setClientChangeHandler((count) => {
    if (count > 0) void tickBoard();
  });

  hub.wss.on('connection', (socket) => {
    if (started || state.matches.length) {
      hub.send(socket, snapshotPayload());
    }
  });

  let stopped = false;
  let boardTimer: ReturnType<typeof setTimeout> | undefined;
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  let sideTimer: ReturnType<typeof setTimeout> | undefined;

  const boardLoop = async () => {
    if (stopped) return;
    const startedAt = Date.now();
    await tickBoard();
    if (stopped) return;
    const wait = Math.max(100, options.intervalMs - (Date.now() - startedAt));
    boardTimer = setTimeout(() => void boardLoop(), wait);
  };

  const pulseLoop = async () => {
    if (stopped) return;
    const startedAt = Date.now();
    await tickPulse();
    if (stopped) return;
    const wait = Math.max(100, pulseIntervalMs - (Date.now() - startedAt));
    pulseTimer = setTimeout(() => void pulseLoop(), wait);
  };

  const sideLoop = async () => {
    if (stopped) return;
    const startedAt = Date.now();
    await tickSide();
    if (stopped) return;
    const wait = Math.max(200, sideIntervalMs - (Date.now() - startedAt));
    sideTimer = setTimeout(() => void sideLoop(), wait);
  };

  void tickBoard().finally(() => {
    if (!stopped) {
      boardTimer = setTimeout(() => void boardLoop(), options.intervalMs);
      pulseTimer = setTimeout(() => void pulseLoop(), 200);
      sideTimer = setTimeout(() => void sideLoop(), 400);
    }
  });

  return {
    state,
    findMatch,
    rememberOne,
    setWatchIds,
    stop: () => {
      stopped = true;
      if (boardTimer) clearTimeout(boardTimer);
      if (pulseTimer) clearTimeout(pulseTimer);
      if (sideTimer) clearTimeout(sideTimer);
    },
    refresh: () => tickBoard(),
  };
}

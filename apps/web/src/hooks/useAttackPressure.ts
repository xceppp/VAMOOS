/**
 * Attack pressure, derived entirely in the browser.
 *
 * MatchDetailPage already refetches /api/matches/:id every 12s, and that
 * payload already carries the cumulative counters (Dangerous Attacks, Attacks,
 * Corner Kicks, Shots on Goal). This hook diffs them across refetches and
 * produces a frame per refetch. No new requests, no server changes.
 *
 * Drop at: apps/web/src/hooks/useAttackPressure.ts
 */

import { useEffect, useRef, useState } from 'react';

export interface MomentumFrame {
  at: number;
  /** -1 = away goal line, 0 = midfield, +1 = home goal line */
  x: number;
  /** 0..1 — how hot the current phase is */
  heat: number;
  side: 'home' | 'away' | 'neutral';
  corner: 'home' | 'away' | null;
  shot: 'home' | 'away' | null;
}

type StatRows = Array<{ type: string; home: string | number | null; away: string | number | null }>;

interface Counters {
  dangerousHome: number;
  dangerousAway: number;
  attacksHome: number;
  attacksAway: number;
  cornersHome: number;
  cornersAway: number;
  sotHome: number;
  sotAway: number;
}

const ZERO: Counters = {
  dangerousHome: 0,
  dangerousAway: 0,
  attacksHome: 0,
  attacksAway: 0,
  cornersHome: 0,
  cornersAway: 0,
  sotHome: 0,
  sotAway: 0,
};

const W_DANGEROUS = 2.4;
const W_ATTACK = 0.55;
const W_CORNER = 3.0;
const W_SHOT = 4.0;

const EASE = 0.42;
const DECAY = 0.86;
const MAX_FRAMES = 60;

const LIVE_STATUSES = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE']);

function num(v: string | number | null | undefined): number {
  const n = Number(String(v ?? '').replace('%', '').trim());
  return Number.isFinite(n) ? n : 0;
}

function pick(rows: StatRows, ...labels: string[]): { home: number; away: number } | null {
  for (const label of labels) {
    const row = rows.find((r) => r.type.toLowerCase() === label.toLowerCase());
    if (row) return { home: num(row.home), away: num(row.away) };
  }
  for (const label of labels) {
    const row = rows.find((r) => r.type.toLowerCase().includes(label.toLowerCase()));
    if (row) return { home: num(row.home), away: num(row.away) };
  }
  return null;
}

function readCounters(rows: StatRows): Counters {
  // Flashscore-style feeds often omit Attacks / Dangerous Attacks.
  // Fall back to territory / chance proxies that still move with the game.
  const dangerous = pick(
    rows,
    'Dangerous Attacks',
    'Dangerous attacks',
    'Big chances',
    'Touches in opposition box',
    'Shots inside the box',
  );
  const attacks = pick(rows, 'Attacks', 'Total Attacks', 'Total shots');
  const corners = pick(rows, 'Corner Kicks', 'Corners');
  const sot = pick(rows, 'Shots on Goal', 'Shots on Target');
  return {
    dangerousHome: dangerous?.home ?? 0,
    dangerousAway: dangerous?.away ?? 0,
    attacksHome: attacks?.home ?? 0,
    attacksAway: attacks?.away ?? 0,
    cornersHome: corners?.home ?? 0,
    cornersAway: corners?.away ?? 0,
    sotHome: sot?.home ?? 0,
    sotAway: sot?.away ?? 0,
  };
}

/** Counters only ever rise; a drop means the feed reset, so treat it as no change. */
function delta(next: Counters, prev: Counters): Counters {
  const d = { ...ZERO };
  for (const k of Object.keys(ZERO) as Array<keyof Counters>) {
    d[k] = Math.max(0, next[k] - prev[k]);
  }
  return d;
}

/** True when the feed publishes at least one pressure-related row (values may still be 0–0). */
function feedSupportsPressure(rows: StatRows): boolean {
  return Boolean(
    pick(rows, 'Dangerous Attacks', 'Dangerous attacks') ||
      pick(rows, 'Attacks', 'Total Attacks') ||
      pick(rows, 'Total shots') ||
      pick(rows, 'Big chances') ||
      pick(rows, 'Touches in opposition box') ||
      pick(rows, 'Shots inside the box') ||
      pick(rows, 'Corner Kicks', 'Corners') ||
      pick(rows, 'Shots on Goal', 'Shots on Target'),
  );
}

export interface AttackPressure {
  frames: MomentumFrame[];
  current: MomentumFrame | null;
  /** False when the feed carries no attack counters for this match. */
  supported: boolean;
}

export function useAttackPressure(input: {
  matchId: number;
  status: string;
  rows: StatRows;
}): AttackPressure {
  const [frames, setFrames] = useState<MomentumFrame[]>([]);
  const [supported, setSupported] = useState(true);

  const prev = useRef<Counters | null>(null);
  const pos = useRef({ x: 0, heat: 0 });
  const seenMatch = useRef<number | null>(null);

  // Reset everything when navigating to a different match.
  useEffect(() => {
    if (seenMatch.current === input.matchId) return;
    seenMatch.current = input.matchId;
    prev.current = null;
    pos.current = { x: 0, heat: 0 };
    setFrames([]);
    setSupported(true);
  }, [input.matchId]);

  useEffect(() => {
    if (!LIVE_STATUSES.has(input.status)) return;
    if (!input.rows.length) return;

    const counters = readCounters(input.rows);

    if (!feedSupportsPressure(input.rows)) {
      setSupported(false);
      return;
    }
    setSupported(true);

    // First reading only establishes a baseline. Emitting here would dump the
    // whole match-to-date total in as one delta and slam the marker into a box.
    if (!prev.current) {
      prev.current = counters;
      return;
    }

    const d = delta(counters, prev.current);
    prev.current = counters;

    const homePush =
      d.dangerousHome * W_DANGEROUS +
      d.attacksHome * W_ATTACK +
      d.cornersHome * W_CORNER +
      d.sotHome * W_SHOT;
    const awayPush =
      d.dangerousAway * W_DANGEROUS +
      d.attacksAway * W_ATTACK +
      d.cornersAway * W_CORNER +
      d.sotAway * W_SHOT;

    const total = homePush + awayPush;
    const net = homePush - awayPush;
    const target = total > 0 ? Math.tanh(net / 5.5) : 0;

    if (total > 0) {
      pos.current.x += (target - pos.current.x) * EASE;
      pos.current.heat = Math.min(1, pos.current.heat * 0.5 + Math.tanh(total / 9) * 0.75);
    } else {
      pos.current.x *= DECAY;
      pos.current.heat *= 0.55;
    }

    const x = pos.current.x;
    const frame: MomentumFrame = {
      at: Date.now(),
      x: Number(x.toFixed(3)),
      heat: Number(pos.current.heat.toFixed(3)),
      side: Math.abs(x) < 0.12 ? 'neutral' : x > 0 ? 'home' : 'away',
      corner: d.cornersHome > 0 ? 'home' : d.cornersAway > 0 ? 'away' : null,
      shot: d.sotHome > 0 ? 'home' : d.sotAway > 0 ? 'away' : null,
    };

    setFrames((list) => {
      const next = [...list, frame];
      return next.length > MAX_FRAMES ? next.slice(-MAX_FRAMES) : next;
    });
    // Rows are a fresh array on every refetch, so this fires once per refetch.
  }, [input.rows, input.status]);

  return {
    frames,
    current: frames.length ? frames[frames.length - 1] : null,
    supported,
  };
}

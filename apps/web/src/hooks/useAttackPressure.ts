/**
 * Attack pressure, derived in the browser from the match-detail payload.
 *
 * IMPORTANT: this reads the label vocabulary the Flashscore feed actually
 * sends (see the `preferred` list in apps/server/src/liveFeed.ts). It does NOT
 * use "Dangerous Attacks" or "Attacks" — those are Sportradar stats and are
 * never present on this feed.
 *
 * Replaces: apps/web/src/hooks/useAttackPressure.ts
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

/**
 * Counters that tick upward during play, with how hard each pulls the marker.
 * `invert: true` means the stat credits the OPPOSITE side — a save by the home
 * keeper, or a home goal kick, both mean the away team was attacking.
 */
const SIGNALS: Array<{ labels: string[]; weight: number; invert?: boolean }> = [
  // Rich coverage — high frequency and genuinely territorial.
  { labels: ['Touches in opposition box'], weight: 1.6 },
  { labels: ['Passes in final third'], weight: 0.35 },
  { labels: ['Big chances'], weight: 4.5 },
  { labels: ['Shots inside the box'], weight: 3.0 },
  { labels: ['Expected goals (xG)', 'xG'], weight: 9.0 },

  // Present on almost every covered match.
  { labels: ['Shots on target'], weight: 3.5 },
  { labels: ['Total shots', 'Shots'], weight: 1.8 },
  { labels: ['Corner kicks', 'Corners'], weight: 2.5 },
  { labels: ['Crosses'], weight: 0.8 },
  { labels: ['Offsides'], weight: 0.6 },
  { labels: ['Goalkeeper saves'], weight: 2.0, invert: true },
  { labels: ['Goal kicks'], weight: 1.0, invert: true },
];

const CORNER_INDEX = SIGNALS.findIndex((s) => s.labels[0] === 'Corner kicks');
const SOT_INDEX = SIGNALS.findIndex((s) => s.labels[0] === 'Shots on target');

const POSS_LABELS = ['Ball possession', 'Possession'];

/** How far possession alone can pull the resting position. */
const POSS_PULL = 0.35;
const EASE = 0.42;
/** Impulse scale — larger means the marker needs more action to swing. */
const SCALE = 7.5;
const MAX_FRAMES = 60;
const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE']);

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const s = String(v).trim();
  // "19% (3/16)" / "60% (94/156)" → use the count, not the percentage.
  const counted = s.match(/\((\d+(?:\.\d+)?)\s*\//);
  if (counted) {
    const n = Number(counted[1]);
    if (Number.isFinite(n)) return n;
  }
  const n = Number.parseFloat(s.replace('%', ''));
  return Number.isFinite(n) ? n : 0;
}

function findRow(rows: StatRows, labels: string[]) {
  for (const label of labels) {
    const row = rows.find((r) => r.type.toLowerCase() === label.toLowerCase());
    if (row) return row;
  }
  for (const label of labels) {
    const row = rows.find((r) => r.type.toLowerCase().includes(label.toLowerCase()));
    if (row) return row;
  }
  return null;
}

function pair(rows: StatRows, labels: string[]): { home: number; away: number } | null {
  const row = findRow(rows, labels);
  if (!row) return null;
  return { home: num(row.home), away: num(row.away) };
}

type Snapshot = Map<number, { home: number; away: number }>;

function readSignals(rows: StatRows): Snapshot {
  const out: Snapshot = new Map();
  SIGNALS.forEach((sig, i) => {
    const p = pair(rows, sig.labels);
    if (p) out.set(i, p);
  });
  return out;
}

function rose(
  now: Snapshot,
  before: Snapshot,
  index: number,
): 'home' | 'away' | null {
  if (index < 0) return null;
  const a = now.get(index);
  const b = before.get(index);
  if (!a || !b) return null;
  if (a.home > b.home) return 'home';
  if (a.away > b.away) return 'away';
  return null;
}

export interface AttackPressure {
  frames: MomentumFrame[];
  current: MomentumFrame | null;
  /** False when the feed carries no usable counters for this match. */
  supported: boolean;
  /** Which signals were found — useful for checking coverage per league. */
  found: string[];
}

export function useAttackPressure(input: {
  matchId: number;
  status: string;
  rows: StatRows;
}): AttackPressure {
  const [frames, setFrames] = useState<MomentumFrame[]>([]);
  const [supported, setSupported] = useState(true);
  const [found, setFound] = useState<string[]>([]);

  const prev = useRef<Snapshot | null>(null);
  const pos = useRef({ x: 0, heat: 0 });
  const seenMatch = useRef<number | null>(null);
  /** Guards against the effect firing on renders that carry no new data. */
  const lastFingerprint = useRef<string>('');

  useEffect(() => {
    if (seenMatch.current === input.matchId) return;
    seenMatch.current = input.matchId;
    prev.current = null;
    pos.current = { x: 0, heat: 0 };
    lastFingerprint.current = '';
    setFrames([]);
    setSupported(true);
    setFound([]);
  }, [input.matchId]);

  useEffect(() => {
    if (!LIVE_STATUSES.has(input.status)) return;
    if (!input.rows.length) return;

    // The parent may hand us a new array identity on every render. Only act
    // when the underlying numbers actually changed — otherwise every render
    // produces a zero delta and the marker decays to midfield and stays there.
    const fingerprint = input.rows.map((r) => `${r.type}:${r.home}:${r.away}`).join('|');
    if (fingerprint === lastFingerprint.current) return;
    lastFingerprint.current = fingerprint;

    const snapshot = readSignals(input.rows);

    if (snapshot.size === 0) {
      setSupported(false);
      return;
    }
    setSupported(true);
    setFound([...snapshot.keys()].map((i) => SIGNALS[i].labels[0]));

    const poss = pair(input.rows, POSS_LABELS);
    const possBias = poss ? ((poss.home - 50) / 50) * POSS_PULL : 0;

    const pushFrame = (
      x: number,
      heat: number,
      corner: MomentumFrame['corner'],
      shot: MomentumFrame['shot'],
    ) => {
      const frame: MomentumFrame = {
        at: Date.now(),
        x: Number(x.toFixed(3)),
        heat: Number(heat.toFixed(3)),
        side: Math.abs(x) < 0.1 ? 'neutral' : x > 0 ? 'home' : 'away',
        corner,
        shot,
      };
      setFrames((list) => {
        const next = [...list, frame];
        return next.length > MAX_FRAMES ? next.slice(-MAX_FRAMES) : next;
      });
    };

    if (!prev.current) {
      prev.current = snapshot;
      // Seed from possession and emit immediately — otherwise the UI stays
      // blank/midfield until the next refetch (~12–60s) and looks broken.
      pos.current.x = possBias;
      pos.current.heat = Math.min(0.45, 0.2 + Math.abs(possBias));
      pushFrame(pos.current.x, pos.current.heat, null, null);
      return;
    }

    let homePush = 0;
    let awayPush = 0;

    for (const [i, now] of snapshot) {
      const before = prev.current.get(i);
      if (!before) continue;
      const sig = SIGNALS[i];
      const dh = Math.max(0, now.home - before.home);
      const da = Math.max(0, now.away - before.away);
      if (sig.invert) {
        awayPush += dh * sig.weight;
        homePush += da * sig.weight;
      } else {
        homePush += dh * sig.weight;
        awayPush += da * sig.weight;
      }
    }

    const corner = rose(snapshot, prev.current, CORNER_INDEX);
    const shot = rose(snapshot, prev.current, SOT_INDEX);

    prev.current = snapshot;

    const total = homePush + awayPush;
    const net = homePush - awayPush;

    // Rest toward the possession bias rather than dead centre.
    const target = total > 0 ? Math.tanh(net / SCALE) * 0.75 + possBias * 0.25 : possBias;

    pos.current.x += (target - pos.current.x) * EASE;
    pos.current.heat =
      total > 0
        ? Math.min(1, pos.current.heat * 0.5 + Math.tanh(total / 12) * 0.75)
        : Math.max(0.12, pos.current.heat * 0.7);

    pushFrame(pos.current.x, pos.current.heat, corner, shot);
  }, [input.rows, input.status]);

  return {
    frames,
    current: frames.length ? frames[frames.length - 1] : null,
    supported,
    found,
  };
}

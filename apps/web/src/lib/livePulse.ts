/** Client-side live pulse from stats already on the match detail payload. */

export type PulseLevel = 'high' | 'med' | 'low';
export type PulseSide = 'home' | 'away' | 'both';

export interface PulseSignal {
  id: string;
  side: PulseSide;
  level: PulseLevel;
  labelKey:
    | 'pulseHighAttack'
    | 'pulsePressing'
    | 'pulseCornerStorm'
    | 'pulseGoalThreat'
    | 'pulseQuiet'
    | 'pulseShotHeavy'
    | 'pulsePossDominant';
  teamName?: string;
}

export interface LivePulse {
  live: boolean;
  pNextGoal: number;
  pNextCorner: number;
  intensity: number;
  goalLevel: PulseLevel;
  cornerLevel: PulseLevel;
  signals: PulseSignal[];
  key: {
    possession: { home: number; away: number } | null;
    shotsOn: { home: number; away: number } | null;
    shotsTotal: { home: number; away: number } | null;
    corners: { home: number; away: number } | null;
    dangerous: { home: number; away: number } | null;
    attacks: { home: number; away: number } | null;
    xg: { home: number; away: number } | null;
  };
}

export interface StatPair {
  home: number;
  away: number;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function pickStat(
  rows: Array<{ type: string; home: string | number | null; away: string | number | null }>,
  ...labels: string[]
): StatPair | null {
  for (const label of labels) {
    const row = rows.find((r) => r.type.toLowerCase() === label.toLowerCase());
    if (!row) continue;
    const home = Number(String(row.home ?? '').replace('%', ''));
    const away = Number(String(row.away ?? '').replace('%', ''));
    if (Number.isFinite(home) && Number.isFinite(away)) return { home, away };
  }
  for (const label of labels) {
    const row = rows.find((r) => r.type.toLowerCase().includes(label.toLowerCase()));
    if (!row) continue;
    const home = Number(String(row.home ?? '').replace('%', ''));
    const away = Number(String(row.away ?? '').replace('%', ''));
    if (Number.isFinite(home) && Number.isFinite(away)) return { home, away };
  }
  return null;
}

function attackScore(input: {
  sot: number;
  corners: number;
  dangerous: number;
  attacks: number;
  poss: number;
  xg: number;
}): number {
  return (
    input.sot * 2.2 +
    input.corners * 1.1 +
    input.dangerous * 1.6 +
    input.attacks * 0.25 +
    input.xg * 2.5 +
    (input.poss >= 58 ? 1.2 : input.poss >= 52 ? 0.4 : 0)
  );
}

function levelFromP(p: number, high = 0.55, med = 0.35): PulseLevel {
  if (p >= high) return 'high';
  if (p >= med) return 'med';
  return 'low';
}

export function buildLivePulse(input: {
  status: string;
  elapsed: number | null;
  homeName: string;
  awayName: string;
  goalsHome: number;
  goalsAway: number;
  rows: Array<{ type: string; home: string | number | null; away: string | number | null }>;
  fallbackPoss?: { home: number; away: number } | null;
  fallbackCorners?: { home: number; away: number } | null;
}): LivePulse {
  const liveStatuses = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE']);
  const live = liveStatuses.has(input.status) && input.status !== 'FT';
  const minute = input.elapsed ?? (input.status === 'HT' ? 45 : live ? 70 : 90);
  const left = live ? Math.max(90 - Math.min(minute, 90), input.status === 'HT' ? 45 : 0) : 0;
  const effectiveLeft =
    !live ? 0 : minute >= 90 ? Math.max(left, 4) : minute >= 85 ? Math.max(left, 5) : left + (minute >= 75 ? 2 : 0);

  const possession =
    pickStat(input.rows, 'Ball Possession', 'Possession') ?? input.fallbackPoss ?? null;
  const shotsOn =
    pickStat(input.rows, 'Shots on Goal', 'Shots on Target') ?? null;
  const shotsOff = pickStat(input.rows, 'Shots off Goal', 'Shots off Target');
  const shotsTotal =
    pickStat(input.rows, 'Total Shots', 'Shots') ??
    (shotsOn && shotsOff
      ? { home: shotsOn.home + shotsOff.home, away: shotsOn.away + shotsOff.away }
      : shotsOn);
  const corners =
    pickStat(input.rows, 'Corner Kicks', 'Corners') ?? input.fallbackCorners ?? null;
  const dangerous = pickStat(input.rows, 'Dangerous Attacks', 'Dangerous attacks');
  const attacks = pickStat(input.rows, 'Attacks', 'Total Attacks');
  const xg = pickStat(input.rows, 'Expected goals (xG)', 'xG', 'Expected Goals');

  const sotH = shotsOn?.home ?? 0;
  const sotA = shotsOn?.away ?? 0;
  const cH = corners?.home ?? 0;
  const cA = corners?.away ?? 0;
  const dH = dangerous?.home ?? 0;
  const dA = dangerous?.away ?? 0;
  const aH = attacks?.home ?? shotsTotal?.home ?? 0;
  const aA = attacks?.away ?? shotsTotal?.away ?? 0;
  const pH = possession?.home ?? 50;
  const pA = possession?.away ?? 50;
  const xH = xg?.home ?? 0;
  const xA = xg?.away ?? 0;

  const homeAttack = attackScore({
    sot: sotH,
    corners: cH,
    dangerous: dH,
    attacks: aH,
    poss: pH,
    xg: xH,
  });
  const awayAttack = attackScore({
    sot: sotA,
    corners: cA,
    dangerous: dA,
    attacks: aA,
    poss: pA,
    xg: xA,
  });

  const elapsedSafe = Math.max(minute, 1);
  const sotRate = (sotH + sotA) / elapsedSafe;
  const cornerRate = (cH + cA) / elapsedSafe;
  const dangerRate = (dH + dA) / elapsedSafe;
  const intensity = clamp01(sotRate * 8 + dangerRate * 0.08 + cornerRate * 4 + (xH + xA) * 0.15);

  const goalsPerRemainMin = intensity * 0.045 + sotRate * 0.35;
  const expectedExtraGoals = goalsPerRemainMin * effectiveLeft;
  const pNextGoal = live ? 1 - Math.exp(-Math.max(expectedExtraGoals, 0)) : 0;

  const cornersPerRemainMin = cornerRate * 0.75 + 0.105 * 0.25 + intensity * 0.02;
  const expectedExtraCorners = cornersPerRemainMin * effectiveLeft;
  const pNextCorner = live ? 1 - Math.exp(-Math.max(expectedExtraCorners, 0)) : 0;

  const signals: PulseSignal[] = [];
  const attackGap = Math.abs(homeAttack - awayAttack);
  const attackLead = homeAttack >= awayAttack ? 'home' : 'away';
  const leadName = attackLead === 'home' ? input.homeName : input.awayName;
  const leadScore = Math.max(homeAttack, awayAttack);

  if (live && leadScore >= 6 && attackGap >= 2.2) {
    signals.push({
      id: 'attack',
      side: attackLead,
      level: leadScore >= 10 || attackGap >= 4 ? 'high' : 'med',
      labelKey: 'pulseHighAttack',
      teamName: leadName,
    });
  }

  if (live && (pH >= 62 || pA >= 62)) {
    const side: PulseSide = pH >= pA ? 'home' : 'away';
    signals.push({
      id: 'poss',
      side,
      level: Math.max(pH, pA) >= 68 ? 'high' : 'med',
      labelKey: 'pulsePossDominant',
      teamName: side === 'home' ? input.homeName : input.awayName,
    });
  }

  if (live && (dH + dA >= 40 || dangerRate >= 0.9)) {
    const side: PulseSide =
      Math.abs(dH - dA) < 4 ? 'both' : dH > dA ? 'home' : 'away';
    signals.push({
      id: 'press',
      side,
      level: dH + dA >= 60 || dangerRate >= 1.2 ? 'high' : 'med',
      labelKey: 'pulsePressing',
      teamName: side === 'both' ? undefined : side === 'home' ? input.homeName : input.awayName,
    });
  }

  if (live && (cH + cA >= 8 || cornerRate >= 0.14 || pNextCorner >= 0.45)) {
    signals.push({
      id: 'corners',
      side: 'both',
      level: pNextCorner >= 0.55 || cH + cA >= 11 ? 'high' : 'med',
      labelKey: 'pulseCornerStorm',
    });
  }

  if (live && (sotH + sotA >= 6 || sotRate >= 0.12)) {
    signals.push({
      id: 'shots',
      side: sotH === sotA ? 'both' : sotH > sotA ? 'home' : 'away',
      level: sotH + sotA >= 9 ? 'high' : 'med',
      labelKey: 'pulseShotHeavy',
      teamName:
        sotH === sotA ? undefined : sotH > sotA ? input.homeName : input.awayName,
    });
  }

  if (live && (pNextGoal >= 0.4 || intensity >= 0.55)) {
    signals.push({
      id: 'goal',
      side: 'both',
      level: pNextGoal >= 0.55 || intensity >= 0.7 ? 'high' : 'med',
      labelKey: 'pulseGoalThreat',
    });
  }

  if (live && signals.length === 0) {
    signals.push({
      id: 'quiet',
      side: 'both',
      level: 'low',
      labelKey: 'pulseQuiet',
    });
  }

  // Prefer sharper signals first
  const order = { high: 0, med: 1, low: 2 };
  signals.sort((a, b) => order[a.level] - order[b.level]);

  return {
    live,
    pNextGoal: Number(pNextGoal.toFixed(3)),
    pNextCorner: Number(pNextCorner.toFixed(3)),
    intensity: Number(intensity.toFixed(3)),
    goalLevel: levelFromP(pNextGoal),
    cornerLevel: levelFromP(pNextCorner, 0.5, 0.32),
    signals: signals.slice(0, 5),
    key: {
      possession,
      shotsOn,
      shotsTotal,
      corners,
      dangerous,
      attacks,
      xg,
    },
  };
}

export function featuredStatRows(
  rows: Array<{ type: string; home: string | number | null; away: string | number | null }>,
  key: LivePulse['key'],
): Array<{ type: string; home: number; away: number; kind: 'percent' | 'count' }> {
  const out: Array<{ type: string; home: number; away: number; kind: 'percent' | 'count' }> = [];
  const push = (
    label: string,
    pair: StatPair | null,
    kind: 'percent' | 'count',
  ) => {
    if (!pair) return;
    out.push({ type: label, home: pair.home, away: pair.away, kind });
  };
  push('Possession', key.possession, 'percent');
  push('Shots on target', key.shotsOn, 'count');
  push('Total shots', key.shotsTotal, 'count');
  push('Dangerous attacks', key.dangerous, 'count');
  push('Attacks', key.attacks, 'count');
  push('Corners', key.corners, 'count');
  push('xG', key.xg, 'count');

  if (out.length) return out;

  // Fallback: first numeric rows from feed
  for (const row of rows.slice(0, 8)) {
    const home = Number(String(row.home ?? '').replace('%', ''));
    const away = Number(String(row.away ?? '').replace('%', ''));
    if (!Number.isFinite(home) || !Number.isFinite(away)) continue;
    out.push({
      type: row.type,
      home,
      away,
      kind: String(row.home).includes('%') ? 'percent' : 'count',
    });
  }
  return out;
}

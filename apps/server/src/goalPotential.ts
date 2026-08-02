/** Live match goal + corner potential engine → BET / MED / HARD. */

import type { AiscoreParsed } from './aiscoreParse.js';

export type VerdictCall = 'BET' | 'NAH' | 'LEAN BET' | 'LEAN NAH';
export type RiskLevel = 'green' | 'orange' | 'red';

export interface GoalPotentialResult {
  match: {
    home: string;
    away: string;
    score: string;
    minute: number | null;
    status: string | null;
    url: string;
  };
  stats: {
    possession: string;
    shotsOn: string;
    shotsOff: string;
    attacks: string;
    dangerous: string;
    corners: string;
    xg: string;
  };
  model: {
    intensity: number;
    goalsPerRemainMin: number;
    minutesLeft: number;
    expectedExtraGoals: number;
    pNextGoal: number;
    pOverCurrentLine: number;
    pBtts: number;
    cornersTotal: number;
    cornersPerRemainMin: number;
    expectedExtraCorners: number;
    pNextCorner: number;
    cornerIntensity: number;
  };
  verdict: {
    call: VerdictCall;
    market: string;
    confidence: number;
    reasons: string[];
    goalRisk: RiskLevel;
    cornerCall: VerdictCall;
    cornerMarket: string;
    cornerConfidence: number;
    cornerRisk: RiskLevel;
    /** Best actionable angle for the board */
    boardRisk: RiskLevel;
  };
  notes: string[];
}

function n(v: number | null | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function poissonAtLeastOne(lambda: number): number {
  if (lambda <= 0) return 0;
  return 1 - Math.exp(-lambda);
}

function riskFromProb(p: number, greenAt: number, orangeAt: number): RiskLevel {
  if (p >= greenAt) return 'green';
  if (p >= orangeAt) return 'orange';
  return 'red';
}

function callFromRisk(risk: RiskLevel, leanOrange = true): VerdictCall {
  if (risk === 'green') return 'BET';
  if (risk === 'orange') return leanOrange ? 'LEAN BET' : 'LEAN NAH';
  return 'NAH';
}

function betterRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const rank = { green: 2, orange: 1, red: 0 };
  return rank[a] >= rank[b] ? a : b;
}

export function analyzeGoalPotential(input: AiscoreParsed): GoalPotentialResult {
  const homeG = n(input.homeGoals);
  const awayG = n(input.awayGoals);
  const totalGoals = homeG + awayG;
  const minute = input.minute ?? (input.status === 'HT' ? 45 : input.status === 'FT' ? 90 : 70);
  const isFt = input.status === 'FT' || minute >= 120;
  const minutesLeft = isFt ? 0 : clamp(90 - Math.min(minute, 90), 0, 90);

  // Injury-time buffer — late games almost always play extra
  let effectiveLeft = minutesLeft;
  if (!isFt) {
    if (minute >= 90) effectiveLeft = Math.max(effectiveLeft, 4);
    else if (minute >= 85) effectiveLeft = Math.max(minutesLeft, 5);
    else if (minute >= 75) effectiveLeft = minutesLeft + 2.5;
    else if (input.status === 'ET') effectiveLeft = Math.max(minutesLeft, 8);
  }

  const sotH = n(input.shotsOnHome);
  const sotA = n(input.shotsOnAway);
  const offH = n(input.shotsOffHome);
  const offA = n(input.shotsOffAway);
  const shotsOn = sotH + sotA;
  const shotsOff = offH + offA;
  const totalShots = shotsOn + shotsOff + n(input.attacksHome) + n(input.attacksAway);
  // attacks field may already be total shots from FS — avoid double count by preferring explicit
  const attacks = Math.max(
    n(input.attacksHome) + n(input.attacksAway),
    shotsOn + shotsOff,
  );
  const dangerous = n(input.dangerousHome) + n(input.dangerousAway);
  const cornersH = n(input.cornersHome);
  const cornersA = n(input.cornersAway);
  const corners = cornersH + cornersA;
  const xgH = n(input.xgHome);
  const xgA = n(input.xgAway);
  const xg = xgH + xgA;
  const possH = n(input.possessionHome, 50);
  const elapsed = Math.max(minute, 1);
  const scoreGap = Math.abs(homeG - awayG);
  const isDraw = homeG === awayG;
  const isClose = scoreGap <= 1;

  // ---- Goal rate model ----
  // Blend shot-based, xG-based, and pressure-based rates (goals per minute)
  const shotRate = (shotsOn * 0.22 + shotsOff * 0.05) / elapsed;
  const xgRate = xg > 0 ? (xg * 0.85) / elapsed : shotRate;
  const pressureRate =
    (dangerous / elapsed) * 0.012 + (attacks / elapsed) * 0.0035 + (corners / elapsed) * 0.01;
  let baseGoalRate = xg > 0 ? xgRate * 0.55 + shotRate * 0.25 + pressureRate * 0.2 : shotRate * 0.65 + pressureRate * 0.35;

  // Unfinished xG: if xG >> goals, finishing regression → more goals likely
  if (xg > 0 && xg - totalGoals >= 0.8) {
    baseGoalRate *= 1 + clamp((xg - totalGoals) * 0.12, 0, 0.35);
  }
  // Overperformance: many goals on low xG → fade a bit
  if (xg > 0 && totalGoals - xg >= 1.2) {
    baseGoalRate *= 0.85;
  }

  // Game-state multipliers (late chaos / park-the-bus)
  let stateMult = 1;
  if (isClose) stateMult *= 1.12;
  if (isDraw && minute >= 70) stateMult *= 1.18;
  if (scoreGap >= 3) stateMult *= 0.72; // dead rubber
  if (scoreGap === 2 && minute >= 80) stateMult *= 0.9;
  // One team dominating possession but match still open
  if (Math.abs(possH - 50) >= 18 && isClose) stateMult *= 1.08;
  // Sterile domination: high poss, tiny shot volume
  if (possH >= 65 && shotsOn <= 2 && minute >= 60) stateMult *= 0.8;

  // Late window: games stretch, benches push
  let lateMult = 1;
  if (minute >= 75 && isClose) lateMult *= 1.28;
  else if (minute >= 75) lateMult *= 1.12;
  if (minute >= 85 && isClose) lateMult *= 1.15;
  if (minute >= 88) lateMult *= 1.1;

  const goalsPerRemainMin = clamp(baseGoalRate * stateMult * lateMult, 0.0015, 0.11);
  const expectedExtraGoals = goalsPerRemainMin * effectiveLeft;
  const pNextGoal = isFt ? 0 : poissonAtLeastOne(expectedExtraGoals);

  // BTTS completion
  let pBtts = 1;
  if (homeG > 0 && awayG > 0) pBtts = 1;
  else if (isFt || effectiveLeft <= 0) pBtts = 0;
  else {
    const zeroIsHome = homeG === 0;
    const sideSot = zeroIsHome ? sotH : sotA;
    const share = clamp(0.28 + (sideSot / Math.max(shotsOn, 1)) * 0.35, 0.18, 0.72);
    pBtts = poissonAtLeastOne(expectedExtraGoals * share);
  }

  const sotPer10 = (shotsOn / elapsed) * 10;
  const intensity = clamp(
    (sotPer10 / 1.4) * 0.34 +
      ((dangerous / elapsed) * 10) / 9 * 0.22 +
      ((corners / elapsed) * 10) / 2.2 * 0.18 +
      (xg > 0 ? clamp(xg / (elapsed / 45), 0, 2) / 2 : 0) * 0.16 +
      pNextGoal * 0.1,
    0,
    1,
  );

  // ---- Corner rate model ----
  // Typical match ~9–11 corners. Live rate + attack pressure.
  const cornerPace = corners / elapsed; // per minute so far
  // Soft prior toward league-average pace (~0.11/min) when sample tiny
  const priorCornerPace = 0.105;
  const blendedCornerPace =
    elapsed < 25 ? cornerPace * 0.55 + priorCornerPace * 0.45 : cornerPace * 0.8 + priorCornerPace * 0.2;

  // Corners track attacks / shots / one-way traffic
  const attackCornerSignal =
    (attacks / elapsed) * 0.004 + (shotsOn / elapsed) * 0.015 + (dangerous / elapsed) * 0.006;
  let cornerRate = blendedCornerPace * 0.7 + attackCornerSignal * 0.3;

  let cornerState = 1;
  if (isClose && minute >= 70) cornerState *= 1.2;
  if (isDraw && minute >= 80) cornerState *= 1.15;
  if (scoreGap >= 3) cornerState *= 0.75;
  // Trailing side often forces set pieces
  if (scoreGap === 1 && minute >= 75) cornerState *= 1.12;
  // Very high corner pace already → likely continues if game open
  if (cornerPace >= 0.14 && isClose) cornerState *= 1.1;
  // Dead low pace + closed game
  if (cornerPace <= 0.06 && scoreGap >= 2) cornerState *= 0.8;

  const cornersPerRemainMin = clamp(cornerRate * cornerState * (minute >= 75 ? 1.15 : 1), 0.02, 0.28);
  const expectedExtraCorners = cornersPerRemainMin * effectiveLeft;
  const pNextCorner = isFt ? 0 : poissonAtLeastOne(expectedExtraCorners);
  const cornerIntensity = clamp(
    (cornerPace / 0.14) * 0.45 + (attacks / elapsed / 0.8) * 0.25 + pNextCorner * 0.3,
    0,
    1,
  );

  // ---- Verdicts ----
  const reasons: string[] = [];
  reasons.push(`Score ${homeG}-${awayG} ~${minute}' · ~${effectiveLeft.toFixed(0)}' left`);
  reasons.push(`SOT ${sotH}-${sotA} · corners ${cornersH}-${cornersA} · xG ${xgH.toFixed(2)}-${xgA.toFixed(2)}`);
  reasons.push(
    `P(goal) ${(pNextGoal * 100).toFixed(0)}% (λ=${expectedExtraGoals.toFixed(2)}) · P(corner) ${(pNextCorner * 100).toFixed(0)}% (λ=${expectedExtraCorners.toFixed(2)})`,
  );

  let goalRisk: RiskLevel = 'red';
  let call: VerdictCall = 'NAH';
  let market = 'Next goal / Over goals';
  let confidence = pNextGoal;

  if (isFt || effectiveLeft <= 0) {
    goalRisk = 'red';
    call = 'NAH';
    market = 'Match finished';
    confidence = 0.95;
    reasons.push('Full time — no live goal angle.');
  } else if (shotsOn + corners + xg === 0 && totalGoals === 0 && input.homeGoals == null) {
    goalRisk = 'orange';
    call = 'LEAN NAH';
    market = 'Insufficient stats';
    confidence = 0.35;
    reasons.push('Thin stats — waiting on Flashscore numbers.');
  } else if (minute >= 75) {
    // Late window: calibrate to shorter horizon
    if (pNextGoal >= 0.4 && intensity >= 0.32 && isClose) {
      goalRisk = 'green';
      call = 'BET';
      market = 'Last 15′ next goal / Over (total+0.5)';
      confidence = clamp(pNextGoal * 0.8 + intensity * 0.2, 0.52, 0.9);
      reasons.push('Late + close + live heat → chase another goal.');
    } else if (pNextGoal >= 0.34 && intensity >= 0.28) {
      goalRisk = 'green';
      call = 'BET';
      market = 'Last 15′ next goal';
      confidence = clamp(pNextGoal * 0.85 + intensity * 0.15, 0.48, 0.84);
      reasons.push('Solid late goal chance.');
    } else if (pNextGoal >= 0.24) {
      goalRisk = 'orange';
      call = 'LEAN BET';
      market = 'Last 15′ lean next goal';
      confidence = clamp(pNextGoal, 0.4, 0.68);
      reasons.push('Medium late goal risk.');
    } else {
      goalRisk = 'red';
      call = 'NAH';
      market = 'Skip late goal';
      confidence = clamp(1 - pNextGoal, 0.55, 0.9);
      reasons.push('Late but cold — goals unlikely.');
    }
  } else {
    goalRisk = riskFromProb(pNextGoal, 0.58, 0.42);
    call = callFromRisk(goalRisk);
    market = 'Next goal / Over (total+0.5)';
    confidence = clamp(pNextGoal * 0.9 + intensity * 0.1, 0.4, 0.88);
  }

  // Corner verdict — corners hit more often than goals, so higher bars for "green"
  let cornerRisk: RiskLevel;
  let cornerCall: VerdictCall;
  let cornerMarket = 'Next corner / Over corners';
  let cornerConfidence = pNextCorner;

  if (isFt || effectiveLeft <= 0) {
    cornerRisk = 'red';
    cornerCall = 'NAH';
    cornerMarket = 'Match finished';
    cornerConfidence = 0.95;
  } else if (minute >= 75) {
    if (pNextCorner >= 0.55 && cornerIntensity >= 0.35) {
      cornerRisk = 'green';
      cornerCall = 'BET';
      cornerMarket = `Last 15′ next corner / Over ${corners}.5`;
      cornerConfidence = clamp(pNextCorner * 0.85 + cornerIntensity * 0.15, 0.55, 0.92);
      reasons.push('Corner pace + late pressure → another flag likely.');
    } else if (pNextCorner >= 0.38) {
      cornerRisk = 'orange';
      cornerCall = 'LEAN BET';
      cornerMarket = `Last 15′ lean Over ${corners}.5 corners`;
      cornerConfidence = clamp(pNextCorner, 0.42, 0.72);
      reasons.push('Medium corner chance in the dying minutes.');
    } else {
      cornerRisk = 'red';
      cornerCall = 'NAH';
      cornerMarket = `Skip corners (at ${corners})`;
      cornerConfidence = clamp(1 - pNextCorner, 0.5, 0.88);
      reasons.push('Corner rate too cold for late Over.');
    }
  } else {
    cornerRisk = riskFromProb(pNextCorner, 0.62, 0.45);
    cornerCall = callFromRisk(cornerRisk);
    cornerMarket = `Next corner / Over ${corners}.5`;
    cornerConfidence = clamp(pNextCorner * 0.9 + cornerIntensity * 0.1, 0.4, 0.9);
  }

  if (homeG === 0 || awayG === 0) {
    reasons.push(`BTTS still open — P≈${(pBtts * 100).toFixed(0)}%`);
  }

  const boardRisk = betterRisk(goalRisk, cornerRisk);

  return {
    match: {
      home: input.home,
      away: input.away,
      score: `${homeG}-${awayG}`,
      minute,
      status: input.status,
      url: input.url,
    },
    stats: {
      possession: `${n(input.possessionHome)}% - ${n(input.possessionAway)}%`,
      shotsOn: `${sotH} - ${sotA}`,
      shotsOff: `${offH} - ${offA}`,
      attacks: `${n(input.attacksHome)} - ${n(input.attacksAway)}`,
      dangerous: `${n(input.dangerousHome)} - ${n(input.dangerousAway)}`,
      corners: `${cornersH} - ${cornersA}`,
      xg: `${xgH.toFixed(2)} - ${xgA.toFixed(2)}`,
    },
    model: {
      intensity: Number(intensity.toFixed(3)),
      goalsPerRemainMin: Number(goalsPerRemainMin.toFixed(5)),
      minutesLeft: Number(effectiveLeft.toFixed(1)),
      expectedExtraGoals: Number(expectedExtraGoals.toFixed(3)),
      pNextGoal: Number(pNextGoal.toFixed(4)),
      pOverCurrentLine: Number(pNextGoal.toFixed(4)),
      pBtts: Number(pBtts.toFixed(4)),
      cornersTotal: corners,
      cornersPerRemainMin: Number(cornersPerRemainMin.toFixed(5)),
      expectedExtraCorners: Number(expectedExtraCorners.toFixed(3)),
      pNextCorner: Number(pNextCorner.toFixed(4)),
      cornerIntensity: Number(cornerIntensity.toFixed(3)),
    },
    verdict: {
      call,
      market,
      confidence: Number(confidence.toFixed(3)),
      reasons,
      goalRisk,
      cornerCall,
      cornerMarket,
      cornerConfidence: Number(cornerConfidence.toFixed(3)),
      cornerRisk,
      boardRisk,
    },
    notes: input.notes,
  };
}

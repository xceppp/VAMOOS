/** Scan live feed matches for last-15-min goal + corner potential. */
import { type GoalPotentialResult, type RiskLevel } from './goalPotential.js';
export interface LateGoalPick {
    matchId: string;
    /** Numeric app id for /match/:id */
    liveId: number;
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
    expectedExtraGoals: number;
    expectedExtraCorners: number;
    intensity: number;
    cornerIntensity: number;
    call: GoalPotentialResult['verdict']['call'];
    cornerCall: GoalPotentialResult['verdict']['call'];
    confidence: number;
    cornerConfidence: number;
    market: string;
    cornerMarket: string;
    reasons: string[];
    stats: GoalPotentialResult['stats'];
    xg: string | null;
    corners: string;
    goalRisk: RiskLevel;
    cornerRisk: RiskLevel;
    risk: RiskLevel;
}
export interface LateGoalScanResult {
    at: string;
    source: 'live';
    liveTotal: number;
    lateWindowTotal: number;
    scannedWithStats: number;
    picks: LateGoalPick[];
    watch: LateGoalPick[];
    matches: LateGoalPick[];
    notice: string | null;
}
export declare function scanLateGoalPotential(opts?: {
    minMinute?: number;
    force?: boolean;
}): Promise<LateGoalScanResult>;

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
export declare function analyzeGoalPotential(input: AiscoreParsed): GoalPotentialResult;

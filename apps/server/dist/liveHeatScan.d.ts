/**
 * Live Predictions heat: rank in-play matches by corners + chance of more,
 * and by shots on target + chance of scoring.
 */
import { type RiskLevel } from './goalPotential.js';
export interface LiveHeatPick {
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
    cornerRisk: RiskLevel;
    heatCorners: number;
    shotsOnHome: number;
    shotsOnAway: number;
    shotsOnTotal: number;
    pNextGoal: number;
    expectedExtraGoals: number;
    goalPick: string;
    goalConfidence: number;
    goalRisk: RiskLevel;
    heatShots: number;
    possession?: string;
}
export interface LiveHeatBoard {
    at: string;
    corners: LiveHeatPick[];
    shots: LiveHeatPick[];
    scanned: number;
    notice: string | null;
}
export declare function scanLiveHeat(opts?: {
    force?: boolean;
}): Promise<LiveHeatBoard>;

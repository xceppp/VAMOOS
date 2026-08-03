/**
 * Dixon-Coles + Elo predictions via the offline Python engine.
 * Used for live + upcoming boards on the Predictions page.
 */
export interface DixonPick {
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
    expectedGoals: {
        home: number;
        away: number;
        total: number;
    };
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
export interface DixonBoard {
    at: string;
    model: 'dixon-coles-elo';
    live: DixonPick[];
    upcoming: DixonPick[];
    skipped: number;
    notice: string | null;
}
export declare function dixonRisk(p: DixonPick): 'green' | 'orange' | 'red';
export declare function buildDixonBoard(opts?: {
    force?: boolean;
}): Promise<DixonBoard>;

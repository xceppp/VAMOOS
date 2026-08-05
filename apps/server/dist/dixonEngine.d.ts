/**
 * Pure TypeScript Dixon-Coles + Elo board engine.
 * Fits team strengths from pack history (or synthesized prior matches),
 * applies recent form + H2H, then scores Dixon-Coles scorelines.
 * Reads offline league packs from apps/predictor/data/leagues — no Python required.
 */
export interface DixonMarketSide {
    pick: string;
    side?: string;
    team?: string | null;
    prob: number;
    home?: number;
    draw?: number;
    away?: number;
    over?: number;
    under?: number;
    yes?: number;
    no?: number;
    anyGoal?: number;
}
export interface DixonMarkets {
    result: DixonMarketSide;
    moreGoals: DixonMarketSide;
    over15: DixonMarketSide;
    over25: DixonMarketSide;
    over35: DixonMarketSide;
    btts: DixonMarketSide;
    nextGoal: DixonMarketSide | null;
}
export interface DixonEnginePick {
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
    score?: string | null;
    matchedTeams?: boolean;
    pick: string;
    confidence: number;
    confidenceRaw?: number;
    mostLikelyScore: string;
    topScores?: Array<{
        score: string;
        prob: number;
    }>;
    potential: string;
    heat: number;
    expectedGoals: {
        home: number;
        away: number;
        total: number;
    };
    expectedRemaining?: {
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
    markets: DixonMarkets;
    model: 'dixon-coles-elo';
    signals?: {
        formHome: number;
        formAway: number;
        h2hMeetings: number;
        h2hAvgHome: number;
        h2hAvgAway: number;
        matchedHistory: boolean;
    };
}
interface MatchInput {
    id: string;
    liveId?: number;
    home: string;
    away: string;
    league: string;
    homeLogo?: string;
    awayLogo?: string;
    kickoff?: string | null;
    status?: string;
    minute?: number | null;
    score?: string | null;
}
export declare function resolveLeagueSlug(league: string): string | null;
export declare function runDixonBatch(matches: MatchInput[]): {
    results: DixonEnginePick[];
    skipped: Array<{
        id?: string;
        reason?: string;
    }>;
    error?: string;
};
export declare function listAvailablePacks(): string[];
/** Test/helper: clear fitted caches after pack edits. */
export declare function clearDixonCaches(): void;
export {};

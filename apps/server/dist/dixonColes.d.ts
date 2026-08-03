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
    markets?: DixonMarkets;
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

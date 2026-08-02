/** Flashscore live feed + match statistics (unofficial feed API). */
export interface FlashscoreMatch {
    id: string;
    home: string;
    away: string;
    homeLogo?: string;
    awayLogo?: string;
    /** Flashscore participant id (JA) */
    homeTeamId?: string;
    /** Flashscore participant id (JB) */
    awayTeamId?: string;
    homeGoals: number;
    awayGoals: number;
    league: string;
    leagueLogo?: string;
    statusCode: number;
    stageCode: number;
    minute: number | null;
    status: 'LIVE' | 'HT' | 'FT' | 'NS' | 'ET';
    periodStartTs: number | null;
    /** Kickoff unix seconds (AD). */
    kickoffTs: number | null;
    homeSlug: string | null;
    awaySlug: string | null;
    url: string;
}
export interface FlashscoreLiveOdds {
    home: number | null;
    draw: number | null;
    away: number | null;
}
/** Live board rows: in-play matches + recently finished so final scores aren't skipped. */
export declare function selectBoardMatches(all: FlashscoreMatch[], 
/** Flashscore ids to keep briefly after they leave the in-play list (FT flip). */
retainUntil?: Map<string, number>): FlashscoreMatch[];
/** Flashscore crest / league badge URL from feed image filename. */
export declare function flashscoreImageUrl(file: string | null | undefined): string | undefined;
export interface FlashscoreStatRow {
    type: string;
    home: string;
    away: string;
    group?: string;
}
export interface FlashscoreStatPeriod {
    name: string;
    rows: FlashscoreStatRow[];
}
export interface FlashscoreStats {
    possessionHome: number | null;
    possessionAway: number | null;
    shotsOnHome: number | null;
    shotsOnAway: number | null;
    shotsOffHome: number | null;
    shotsOffAway: number | null;
    totalShotsHome: number | null;
    totalShotsAway: number | null;
    cornersHome: number | null;
    cornersAway: number | null;
    xgHome: number | null;
    xgAway: number | null;
    /** Full Match-period rows (all labels Flashscore sent). */
    rows: FlashscoreStatRow[];
    periods: FlashscoreStatPeriod[];
    raw: Record<string, {
        home: string;
        away: string;
    }>;
}
/**
 * Decode Flashscore stage → clock.
 * AO is the start of the *current period* (1H / 2H / ET), not kickoff.
 * Important: stage 38 is first half — NOT extra time.
 */
export declare function estimateMinute(fields: {
    AB?: string;
    AC?: string;
    AO?: string;
}): {
    minute: number | null;
    status: FlashscoreMatch['status'];
};
export declare function parseFootballFeed(raw: string): FlashscoreMatch[];
export declare function fetchFootballFeed(force?: boolean): Promise<FlashscoreMatch[]>;
/** Flashscore day board: 0 = today, 1 = tomorrow, … */
export declare function fetchFootballFeedDay(dayOffset: number, force?: boolean): Promise<FlashscoreMatch[]>;
export declare function selectUpcomingMatches(all: FlashscoreMatch[]): FlashscoreMatch[];
export declare function fetchFlashscoreUpcomingMatches(scorePopularity: (input: {
    league: string;
    homeName: string;
    awayName: string;
}) => number, days?: number): Promise<{
    days: Array<{
        dayOffset: number;
        matches: import('./types.js').LiveMatch[];
    }>;
    at: string;
}>;
export interface ScorePulse {
    homeGoals: number;
    awayGoals: number;
    statusCode: number;
    stageCode: number;
    periodStartTs: number | null;
}
/** Tiny Flashscore score endpoint — much faster than reloading the full board. */
export declare function parseScorePulse(raw: string): ScorePulse | null;
export declare function fetchMatchScorePulse(matchId: string): Promise<ScorePulse | null>;
export declare function applyScorePulse(match: import('./types.js').LiveMatch, pulse: ScorePulse): import('./types.js').LiveMatch;
/** Find one match in the (cached) feed by Flashscore id or hashed app id. */
export declare function findFlashscoreMatch(opts: {
    flashscoreId?: string;
    liveId?: number;
}): Promise<FlashscoreMatch | undefined>;
export declare function parseStatsFeed(raw: string): FlashscoreStats;
export declare function fetchMatchStats(matchId: string): Promise<FlashscoreStats | null>;
/**
 * Live 1X2 odds from Flashscore's odds GraphQL (HOME_DRAW_AWAY / FULL_TIME).
 * Maps selections via participant ids when available.
 */
export declare function fetchMatchLiveOdds(matchId: string, homeTeamId?: string, awayTeamId?: string): Promise<FlashscoreLiveOdds | null>;
export interface FlashscoreEvent {
    minute: number | null;
    extra: number | null;
    type: string;
    detail: string;
    teamSide: 'home' | 'away' | null;
    player: string | null;
    assist: string | null;
}
/** Parse Flashscore summary/incidents feed into timeline events. */
export declare function parseEventsFeed(raw: string): FlashscoreEvent[];
export declare function fetchMatchEvents(matchId: string): Promise<FlashscoreEvent[]>;
/** Ordered rows for the detail UI — full Match period, preferred order first. */
export declare function statsToRows(stats: FlashscoreStats): Array<{
    type: string;
    home: string | number;
    away: string | number;
}>;
export declare function periodsToRows(stats: FlashscoreStats): Array<{
    name: string;
    statistics: Array<{
        type: string;
        home: string | number;
        away: string | number;
    }>;
}>;
export declare function fetchStatsForMatches(matches: FlashscoreMatch[], concurrency?: number): Promise<Map<string, FlashscoreStats>>;
/** Stable numeric id from Flashscore alphanumeric id (for favorites / routes). */
export declare function flashscoreIdToNumber(id: string): number;
export declare function toLiveMatch(m: FlashscoreMatch, popularity: number): import('./types.js').LiveMatch;
/** Live board from Flashscore (in-play + recently finished). */
export declare function fetchFlashscoreLiveMatches(scorePopularity: (input: {
    league: string;
    homeName: string;
    awayName: string;
}) => number, retainUntil?: Map<string, number>): Promise<import('./types.js').LiveMatch[]>;

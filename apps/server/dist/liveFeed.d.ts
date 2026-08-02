/** Live score feed + match statistics (provider feed API). */
/** Upstream crest/badge base — used by the media proxy only. */
export declare function getLiveImageBase(): string;
export declare function getLiveFeedReferer(): string;
export interface LiveFeedMatch {
    id: string;
    home: string;
    away: string;
    homeLogo?: string;
    awayLogo?: string;
    /** Provider participant id (JA) */
    homeTeamId?: string;
    /** Provider participant id (JB) */
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
export interface LiveFeedOdds {
    home: number | null;
    draw: number | null;
    away: number | null;
}
/** Live board rows: in-play matches + recently finished so final scores aren't skipped. */
export declare function selectBoardMatches(all: LiveFeedMatch[], 
/** Provider ids to keep briefly after they leave the in-play list (FT flip). */
retainUntil?: Map<string, number>): LiveFeedMatch[];
/**
 * Crest / league badge URL served via our media proxy (never expose upstream hosts to clients).
 * Absolute upstream URLs are accepted as-is only when already non-provider absolute paths.
 */
export declare function providerImageUrl(file: string | null | undefined): string | undefined;
export interface FeedStatRow {
    type: string;
    home: string;
    away: string;
    group?: string;
}
export interface FeedStatPeriod {
    name: string;
    rows: FeedStatRow[];
}
export interface FeedStats {
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
    /** Full Match-period rows (all labels the feed sent). */
    rows: FeedStatRow[];
    periods: FeedStatPeriod[];
    raw: Record<string, {
        home: string;
        away: string;
    }>;
}
/**
 * Decode provider stage → clock.
 * AO is the start of the *current period* (1H / 2H / ET), not kickoff.
 * Important: stage 38 is first half — NOT extra time.
 */
export declare function estimateMinute(fields: {
    AB?: string;
    AC?: string;
    AO?: string;
}): {
    minute: number | null;
    status: LiveFeedMatch['status'];
};
export declare function parseFootballFeed(raw: string): LiveFeedMatch[];
export declare function fetchFootballFeed(force?: boolean): Promise<LiveFeedMatch[]>;
/** Day board: 0 = today, 1 = tomorrow, … */
export declare function fetchFootballFeedDay(dayOffset: number, force?: boolean): Promise<LiveFeedMatch[]>;
export declare function selectUpcomingMatches(all: LiveFeedMatch[]): LiveFeedMatch[];
export declare function fetchUpcomingFeedMatches(scorePopularity: (input: {
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
/** Tiny per-match score endpoint — much faster than reloading the full board. */
export declare function parseScorePulse(raw: string): ScorePulse | null;
export declare function fetchMatchScorePulse(matchId: string): Promise<ScorePulse | null>;
export declare function applyScorePulse(match: import('./types.js').LiveMatch, pulse: ScorePulse): import('./types.js').LiveMatch;
/** Find one match in the (cached) feed by provider id or hashed app id. */
export declare function findFeedMatch(opts: {
    providerId?: string;
    liveId?: number;
}): Promise<LiveFeedMatch | undefined>;
export declare function parseStatsFeed(raw: string): FeedStats;
export declare function fetchMatchStats(matchId: string): Promise<FeedStats | null>;
/**
 * Live 1X2 odds from the provider odds GraphQL (HOME_DRAW_AWAY / FULL_TIME).
 * Maps selections via participant ids when available.
 */
export declare function fetchMatchLiveOdds(matchId: string, homeTeamId?: string, awayTeamId?: string): Promise<LiveFeedOdds | null>;
export interface FeedEvent {
    minute: number | null;
    extra: number | null;
    type: string;
    detail: string;
    teamSide: 'home' | 'away' | null;
    player: string | null;
    assist: string | null;
}
/** Parse summary/incidents feed into timeline events. */
export declare function parseEventsFeed(raw: string): FeedEvent[];
export declare function fetchMatchEvents(matchId: string): Promise<FeedEvent[]>;
/** Ordered rows for the detail UI — full Match period, preferred order first. */
export declare function statsToRows(stats: FeedStats): Array<{
    type: string;
    home: string | number;
    away: string | number;
}>;
export declare function periodsToRows(stats: FeedStats): Array<{
    name: string;
    statistics: Array<{
        type: string;
        home: string | number;
        away: string | number;
    }>;
}>;
export declare function fetchStatsForMatches(matches: LiveFeedMatch[], concurrency?: number): Promise<Map<string, FeedStats>>;
/** Stable numeric id from provider alphanumeric id (for favorites / routes). */
export declare function providerIdToNumber(id: string): number;
export declare function toLiveMatch(m: LiveFeedMatch, popularity: number): import('./types.js').LiveMatch;
/** Live board from feed (in-play + recently finished). */
export declare function fetchLiveFeedMatches(scorePopularity: (input: {
    league: string;
    homeName: string;
    awayName: string;
}) => number, retainUntil?: Map<string, number>): Promise<import('./types.js').LiveMatch[]>;

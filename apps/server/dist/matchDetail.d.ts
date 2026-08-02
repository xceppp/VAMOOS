import type { LiveMatch } from './types.js';
export interface MatchStatRow {
    type: string;
    home: string | number | null;
    away: string | number | null;
}
export interface MatchTimelineEvent {
    time: number | null;
    extra: number | null;
    type: string;
    detail: string;
    teamId: number | null;
    teamName: string;
    player: string | null;
    assist: string | null;
}
export interface MatchLineupPlayer {
    id: number | null;
    name: string;
    number: number | null;
    pos: string | null;
    grid: string | null;
}
export interface MatchLineup {
    teamId: number;
    teamName: string;
    teamLogo?: string;
    formation: string | null;
    coach: string | null;
    startXI: MatchLineupPlayer[];
    substitutes: MatchLineupPlayer[];
}
export interface MatchDetail {
    match: LiveMatch;
    venue?: string;
    city?: string;
    referee?: string;
    round?: string;
    events: MatchTimelineEvent[];
    statistics: MatchStatRow[];
    /** Optional half/match breakdowns from the live feed */
    statPeriods?: Array<{
        name: string;
        statistics: MatchStatRow[];
    }>;
    lineups: MatchLineup[];
    mode: 'live' | 'demo' | 'cached';
}
export declare function fetchMatchDetail(apiKey: string, fixtureId: number): Promise<MatchDetail | null>;
export declare function buildDemoMatchDetail(seed: LiveMatch): MatchDetail;
export declare function buildLiveFeedMatchDetail(seed: LiveMatch): Promise<MatchDetail>;

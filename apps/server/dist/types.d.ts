export type MatchStatus = 'NS' | '1H' | 'HT' | '2H' | 'ET' | 'BT' | 'P' | 'FT' | 'AET' | 'PEN' | 'LIVE' | 'PST' | 'CANC' | 'ABD' | 'AWD' | 'WO' | string;
export interface MatchTeam {
    id: number;
    name: string;
    logo?: string;
}
export interface MatchSideStats {
    possessionHome: number | null;
    possessionAway: number | null;
    cornersHome: number | null;
    cornersAway: number | null;
}
/** Live 1X2 decimal odds (home / draw / away). */
export interface MatchOdds {
    home: number | null;
    draw: number | null;
    away: number | null;
}
export interface LiveMatch {
    id: number;
    /** Original Flashscore match id when sourced from FS */
    flashscoreId?: string;
    /** Flashscore participant ids (for odds mapping) */
    homeFsTeamId?: string;
    awayFsTeamId?: string;
    league: string;
    leagueId?: number;
    leagueLogo?: string;
    country?: string;
    /** Relative crowd / attention score for Live sorting */
    popularity: number;
    home: MatchTeam;
    away: MatchTeam;
    goals: {
        home: number | null;
        away: number | null;
    };
    status: MatchStatus;
    elapsed: number | null;
    kickoff?: string;
    /** Compact live stats for the main board */
    stats?: MatchSideStats;
    /** Live 1X2 odds for the main board */
    odds?: MatchOdds;
}
export type AlertEventType = 'goal' | 'kickoff' | 'fulltime' | 'score';
export interface MatchEvent {
    type: AlertEventType;
    matchId: number;
    match: LiveMatch;
    message: string;
    scorer?: 'home' | 'away';
    at: string;
}
export interface SnapshotMessage {
    type: 'snapshot';
    matches: LiveMatch[];
    mode: 'live' | 'demo';
    rateLimited?: boolean;
    notice?: string | null;
    at: string;
}
export interface EventMessage {
    type: 'event';
    event: MatchEvent;
}
export interface PingMessage {
    type: 'ping';
    at: string;
}
export type ServerMessage = SnapshotMessage | EventMessage | PingMessage;

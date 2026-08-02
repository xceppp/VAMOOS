export type MatchStatus = string;

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

export interface MatchOdds {
  home: number | null;
  draw: number | null;
  away: number | null;
}

export interface LiveMatch {
  id: number;
  providerId?: string;
  homeProviderTeamId?: string;
  awayProviderTeamId?: string;
  league: string;
  leagueId?: number;
  leagueLogo?: string;
  country?: string;
  /** Relative crowd / attention score for Live sorting */
  popularity?: number;
  home: MatchTeam;
  away: MatchTeam;
  goals: { home: number | null; away: number | null };
  status: MatchStatus;
  elapsed: number | null;
  kickoff?: string;
  stats?: MatchSideStats;
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

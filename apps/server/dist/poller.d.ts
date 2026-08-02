import type { LiveMatch } from './types.js';
import type { WsHub } from './ws.js';
export interface PollerState {
    matches: LiveMatch[];
    mode: 'live' | 'demo' | 'cached';
    rateLimited: boolean;
    rateLimitedUntil: number | null;
    lastOkAt: string | null;
    notice: string | null;
    source: 'flashscore' | 'api-football' | 'demo';
    lastPulseAt: string | null;
}
export declare function startPoller(hub: WsHub, options: {
    apiKey?: string;
    intervalMs: number;
    pulseIntervalMs?: number;
    /** Possession / corners / odds refresh cadence */
    sideIntervalMs?: number;
    /** Default flashscore — free + fast. api-football as optional override. */
    source?: 'flashscore' | 'api-football';
}): {
    state: PollerState;
    findMatch: (id: number) => LiveMatch | undefined;
    rememberOne: (match: LiveMatch) => void;
    setWatchIds: (ids: number[]) => void;
    stop: () => void;
    refresh: () => Promise<void>;
};

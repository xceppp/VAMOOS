/**
 * Dixon-Coles + Elo predictions board (live + upcoming).
 * Pure TypeScript engine — no Python on the host.
 */
import { type DixonEnginePick, type DixonMarketSide, type DixonMarkets } from './dixonEngine.js';
import { type LiveHeatPick } from './liveHeatScan.js';
export type { DixonMarketSide, DixonMarkets, LiveHeatPick };
export type DixonPick = DixonEnginePick & {
    bucket: 'live' | 'upcoming';
};
export interface DixonBoard {
    at: string;
    model: 'dixon-coles-elo';
    live: DixonPick[];
    upcoming: DixonPick[];
    liveHeat?: {
        corners: LiveHeatPick[];
        shots: LiveHeatPick[];
        scanned: number;
        notice: string | null;
    };
    skipped: number;
    notice: string | null;
}
export declare function dixonRisk(p: DixonPick): 'green' | 'orange' | 'red';
export declare function buildDixonBoard(opts?: {
    force?: boolean;
}): Promise<DixonBoard>;

import type { LiveMatch, MatchEvent } from './types.js';
export declare function diffMatches(prev: Map<number, LiveMatch>, next: LiveMatch[]): MatchEvent[];
export declare function toMap(matches: LiveMatch[]): Map<number, LiveMatch>;

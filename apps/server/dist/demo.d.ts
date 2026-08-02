import type { LiveMatch } from './types.js';
export declare function getDemoMatches(): LiveMatch[];
/** Advance clock and occasionally score a goal for demo mode. */
export declare function tickDemoMatches(): {
    matches: LiveMatch[];
    scored: LiveMatch | null;
};

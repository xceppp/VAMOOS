import { type AiscoreParsed } from './aiscoreParse.js';
export declare function tryFetchAiscore(url: string): Promise<string | null>;
export declare function stripHtml(html: string): string;
export declare function buildAiscoreAnalysis(body: {
    url?: string;
    paste?: string;
    manual?: Partial<AiscoreParsed>;
}): Promise<{
    parsed: AiscoreParsed;
    analysis: import("./goalPotential.js").GoalPotentialResult;
}>;

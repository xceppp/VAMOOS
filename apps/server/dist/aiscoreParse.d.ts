/** Parse AiScore match URLs and pasted match text into structured stats. */
export interface AiscoreParsed {
    url: string;
    matchId: string | null;
    slug: string | null;
    home: string;
    away: string;
    homeGoals: number | null;
    awayGoals: number | null;
    minute: number | null;
    status: string | null;
    possessionHome: number | null;
    possessionAway: number | null;
    shotsOnHome: number | null;
    shotsOnAway: number | null;
    shotsOffHome: number | null;
    shotsOffAway: number | null;
    attacksHome: number | null;
    attacksAway: number | null;
    dangerousHome: number | null;
    dangerousAway: number | null;
    cornersHome?: number | null;
    cornersAway?: number | null;
    xgHome?: number | null;
    xgAway?: number | null;
    source: 'url' | 'paste' | 'manual' | 'mixed';
    notes: string[];
}
export declare function isAiscoreUrl(url: string): boolean;
export declare function parseAiscoreUrl(url: string): Pick<AiscoreParsed, 'url' | 'matchId' | 'slug' | 'home' | 'away' | 'notes'>;
/** Parse copied AiScore page text (title, score, stats block). */
export declare function parseAiscorePaste(text: string, base?: Partial<AiscoreParsed>): AiscoreParsed;

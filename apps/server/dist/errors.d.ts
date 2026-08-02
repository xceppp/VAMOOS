export declare class ApiFootballError extends Error {
    status?: number;
    rateLimited: boolean;
    constructor(message: string, opts?: {
        status?: number;
        rateLimited?: boolean;
    });
}
export declare function isRateLimitError(err: unknown): boolean;

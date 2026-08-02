export class ApiFootballError extends Error {
    status;
    rateLimited;
    constructor(message, opts) {
        super(message);
        this.name = 'ApiFootballError';
        this.status = opts?.status;
        this.rateLimited = Boolean(opts?.rateLimited);
    }
}
export function isRateLimitError(err) {
    if (err instanceof ApiFootballError)
        return err.rateLimited;
    if (!(err instanceof Error))
        return false;
    return /429|rate.?limit|request[s]?\s+limit|reached the request|upgrade your plan/i.test(err.message);
}

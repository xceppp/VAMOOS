export class ApiFootballError extends Error {
  status?: number;
  rateLimited: boolean;

  constructor(message: string, opts?: { status?: number; rateLimited?: boolean }) {
    super(message);
    this.name = 'ApiFootballError';
    this.status = opts?.status;
    this.rateLimited = Boolean(opts?.rateLimited);
  }
}

export function isRateLimitError(err: unknown): boolean {
  if (err instanceof ApiFootballError) return err.rateLimited;
  if (!(err instanceof Error)) return false;
  return /429|rate.?limit|request[s]?\s+limit|reached the request|upgrade your plan/i.test(
    err.message,
  );
}

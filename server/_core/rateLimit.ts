import type { Request, RequestHandler } from "express";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

export function createFixedWindowRateLimiter(options: {
  limit: number;
  windowMs: number;
}) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(key: string, now = Date.now()): RateLimitResult {
      const existing = buckets.get(key);
      const bucket =
        !existing || existing.resetAt <= now
          ? { count: 0, resetAt: now + options.windowMs }
          : existing;

      bucket.count += 1;
      buckets.set(key, bucket);

      if (buckets.size > 10_000) {
        for (const [bucketKey, value] of buckets) {
          if (value.resetAt <= now) buckets.delete(bucketKey);
        }
      }

      return {
        allowed: bucket.count <= options.limit,
        remaining: Math.max(0, options.limit - bucket.count),
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        resetAt: bucket.resetAt,
      };
    },
    clear() {
      buckets.clear();
    },
  };
}

export const publicApiLimiter = createFixedWindowRateLimiter({
  limit: 120,
  windowMs: 60_000,
});

export const chatLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});

export function requestIdentity(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export const publicApiRateLimit: RequestHandler = (req, res, next) => {
  const result = publicApiLimiter.consume(requestIdentity(req));
  res.setHeader("RateLimit-Limit", "120");
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  next();
};

import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * One JSON line per API request with a request id, which is also returned as
 * X-Request-Id so a user-reported error can be matched to a log line.
 * Static assets are skipped, as are the long-lived event streams.
 */
export function requestLog(): RequestHandler {
  return (req, res, next) => {
    const id = (req.get('x-request-id') ?? randomUUID()).slice(0, 64);
    res.setHeader('X-Request-Id', id);

    if (!req.path.startsWith('/api/') || req.path.endsWith('/events')) return next();

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(
        JSON.stringify({
          at: new Date().toISOString(),
          id,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          ms: Math.round(ms * 10) / 10,
          user: req.user?.id,
        }),
      );
    });
    next();
  };
}

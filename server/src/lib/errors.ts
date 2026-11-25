import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = 'error',
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message, 'bad_request');
export const unauthorized = () => new HttpError(401, 'Sign in to continue.', 'unauthorized');
export const forbidden = (message: string) => new HttpError(403, message, 'forbidden');
// Used for documents the caller can't see, so we don't reveal that the id exists.
export const notFound = (message = 'Document not found.') => new HttpError(404, message, 'not_found');

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    res.status(400).json({ error: { code: 'validation', message: `${where}${first?.message ?? 'Invalid input'}` } });
    return;
  }

  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than the 2 MB limit.' : err.message;
    res.status(400).json({ error: { code: 'upload', message } });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  // express.json() raises these for malformed or oversized bodies
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_json', message: 'Request body is not valid JSON.' } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'too_large', message: 'Document is too large to save.' } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on our side.' } });
};

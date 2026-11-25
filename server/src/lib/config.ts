import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 3001),
  databasePath: process.env.DATABASE_PATH ?? path.resolve('data', 'quire.db'),
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  maxUploadBytes: 2 * 1024 * 1024,
  // Directory with the built client. Only served when it exists (i.e. after `npm run build`).
  clientDist: process.env.CLIENT_DIST ?? path.resolve('..', 'client', 'dist'),
};

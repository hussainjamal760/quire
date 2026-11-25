import { createApp } from './app.js';
import { openDatabase } from './db.js';
import { config } from './lib/config.js';

const db = openDatabase(config.databasePath);
const { app, auth, hub } = createApp({
  db,
  sessionTtlMs: config.sessionTtlMs,
  maxUploadBytes: config.maxUploadBytes,
  secureCookies: config.isProduction,
  clientDist: config.clientDist,
  logRequests: process.env.NODE_ENV !== 'test',
});

auth.pruneExpiredSessions();
setInterval(() => auth.pruneExpiredSessions(), 60 * 60 * 1000).unref();
// Keeps idle event streams open through proxies that drop quiet connections.
setInterval(() => hub.heartbeat(), 25_000).unref();

const server = app.listen(config.port, () => {
  console.log(`Quire listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Event streams never finish on their own, so close them rather than wait.
  server.closeAllConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

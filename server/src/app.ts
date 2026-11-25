import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { DB } from './db.js';
import { AuthService } from './services/auth.js';
import { DocumentService } from './services/documents.js';
import { authRouter, loadSession } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { DocumentHub } from './services/hub.js';
import { errorHandler, HttpError } from './lib/errors.js';
import { RateLimiter } from './lib/rateLimit.js';
import { requestLog } from './lib/requestLog.js';

export interface AppOptions {
  db: DB;
  sessionTtlMs: number;
  maxUploadBytes: number;
  secureCookies?: boolean;
  clientDist?: string;
  logRequests?: boolean;
  /** Sign-in attempts allowed per IP + email per 15 minutes. */
  loginAttempts?: number;
}

export function createApp(options: AppOptions) {
  const auth = new AuthService(options.db, options.sessionTtlMs);
  const documents = new DocumentService(options.db);
  const hub = new DocumentHub();
  const loginLimiter = new RateLimiter(options.loginAttempts ?? 10, 15 * 60 * 1000);

  const app = express();
  app.set('trust proxy', 1); // behind Render/Fly's proxy, so secure cookies and req.ip work

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // TipTap and React set inline styles; no inline scripts are allowed.
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: options.secureCookies ? [] : null,
        },
      },
    }),
  );
  if (options.logRequests) app.use(requestLog());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(loadSession(auth));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter(auth, { secureCookies: options.secureCookies ?? false, loginLimiter }));
  app.use('/api/documents', documentsRouter(documents, auth, hub, { maxUploadBytes: options.maxUploadBytes }));
  app.use('/api', () => {
    throw new HttpError(404, 'Not found.', 'not_found');
  });

  // In production the API also serves the built SPA, so there is one thing to deploy.
  if (options.clientDist && fs.existsSync(options.clientDist)) {
    app.use(express.static(options.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(options.clientDist!, 'index.html'));
    });
  }

  app.use(errorHandler);
  return { app, auth, hub };
}

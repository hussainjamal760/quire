import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthService, User } from '../services/auth.js';
import { HttpError, unauthorized } from '../lib/errors.js';
import type { RateLimiter } from '../lib/rateLimit.js';

export const SESSION_COOKIE = 'quire_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

/** Attaches req.user when the session cookie is valid. Never rejects on its own. */
export function loadSession(auth: AuthService): RequestHandler {
  return (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') req.user = auth.userForToken(token) ?? undefined;
    next();
  };
}

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthorized();
  next();
};

/** Typed accessor for handlers mounted behind requireUser. */
export function currentUser(req: Express.Request): User {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function authRouter(
  auth: AuthService,
  { secureCookies, loginLimiter }: { secureCookies: boolean; loginLimiter: RateLimiter },
) {
  const router = Router();

  router.post('/login', (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const limitKey = `${req.ip}:${email}`;
    const limit = loginLimiter.attempt(limitKey);
    if (!limit.allowed) {
      const minutes = Math.ceil(limit.retryAfterMs / 60_000);
      res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000));
      throw new HttpError(
        429,
        `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        'rate_limited',
      );
    }

    const session = auth.login(email, password);
    if (!session) throw new HttpError(401, 'Email or password is incorrect.', 'invalid_credentials');
    loginLimiter.reset(limitKey);

    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      expires: new Date(session.expiresAt),
      path: '/',
    });
    res.json({ user: session.user });
  });

  router.post('/logout', (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') auth.logout(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  // 200 with user: null when signed out. "Nobody" is a normal answer here, and
  // it keeps the browser console free of a red 401 on every visit to the login page.
  router.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  return router;
}

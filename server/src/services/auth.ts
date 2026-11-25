import { randomBytes } from 'node:crypto';
import type { DB } from '../db.js';
import { verifyPassword } from '../lib/passwords.js';

export interface User {
  id: string;
  email: string;
  name: string;
}

export class AuthService {
  constructor(
    private readonly db: DB,
    private readonly sessionTtlMs: number,
  ) {}

  /** Returns a session token, or null when the credentials don't match. */
  login(email: string, password: string): { token: string; user: User; expiresAt: number } | null {
    const row = this.db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(email) as
      (User & { password_hash: string }) | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) return null;

    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + this.sessionTtlMs;
    this.db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, row.id, expiresAt);

    return { token, expiresAt, user: { id: row.id, email: row.email, name: row.name } };
  }

  logout(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  userForToken(token: string): User | null {
    const row = this.db
      .prepare(
        `SELECT u.id, u.email, u.name
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > ?`,
      )
      .get(token, Date.now()) as User | undefined;
    return row ?? null;
  }

  findUserByEmail(email: string): User | null {
    const row = this.db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email) as User | undefined;
    return row ?? null;
  }

  pruneExpiredSessions() {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  }
}

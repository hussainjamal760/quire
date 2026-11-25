import request from 'supertest';
import { createApp } from '../src/app.js';
import { DEMO_PASSWORD, openDatabase } from '../src/db.js';

/** Fresh in-memory app per test file, seeded with the demo users. */
export function makeTestApp(options: { loginAttempts?: number } = {}) {
  const db = openDatabase(':memory:');
  const { app, hub } = createApp({ db, sessionTtlMs: 60_000, maxUploadBytes: 2 * 1024 * 1024, ...options });

  async function signIn(email: string) {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
    return agent;
  }

  return { app, db, hub, signIn };
}

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { previewHtml } from '../src/lib/sanitize.js';
import { RateLimiter } from '../src/lib/rateLimit.js';
import { makeTestApp } from './helpers.js';

describe('sign-in rate limiting', () => {
  it('blocks repeated wrong passwords and says when to try again', async () => {
    const { app } = makeTestApp({ loginAttempts: 3 });
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'alice@ajaia.dev', password: 'wrong' });

    for (let i = 0; i < 3; i++) await attempt().expect(401);
    const blocked = await attempt().expect(429);

    expect(blocked.body.error.message).toMatch(/Try again in 15 minutes/);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('resets the window after it expires', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1000, () => now);
    expect(limiter.attempt('k').allowed).toBe(true);
    expect(limiter.attempt('k').allowed).toBe(false);
    now = 1000;
    expect(limiter.attempt('k').allowed).toBe(true);
  });
});

describe('HTTP hardening', () => {
  it('sends a content security policy and no framework banner', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('previewHtml', () => {
  it('cuts long documents at a block boundary and leaves no open tags', () => {
    const html = Array.from({ length: 40 }, (_, i) => `<p>Paragraph number ${i} with some text</p>`).join('');
    const preview = previewHtml(html);
    expect(preview.length).toBeLessThan(html.length);
    expect(preview.endsWith('</p>')).toBe(true);
  });

  it('closes a list it had to cut into', () => {
    const html = `<ul>${'<li><p>item</p></li>'.repeat(60)}</ul>`;
    const preview = previewHtml(html, 100);
    expect(preview.startsWith('<ul>')).toBe(true);
    expect(preview.endsWith('</ul>')).toBe(true);
  });
});

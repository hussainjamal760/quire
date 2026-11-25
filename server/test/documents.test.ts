import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { makeTestApp } from './helpers.js';

let ctx: ReturnType<typeof makeTestApp>;
let alice: TestAgent;
let bob: TestAgent;
let carol: TestAgent;

beforeEach(async () => {
  ctx = makeTestApp();
  [alice, bob, carol] = await Promise.all([
    ctx.signIn('alice@ajaia.dev'),
    ctx.signIn('bob@ajaia.dev'),
    ctx.signIn('carol@ajaia.dev'),
  ]);
});

async function createDoc(agent: TestAgent, body: object = {}) {
  const res = await agent.post('/api/documents').send(body).expect(201);
  return res.body as { id: string; version: number; title: string; content: string };
}

describe('auth', () => {
  it('rejects requests without a session', async () => {
    await request(ctx.app).get('/api/documents').expect(401);
  });

  it('reports who is signed in, or nobody', async () => {
    const anonymous = await request(ctx.app).get('/api/auth/me').expect(200);
    expect(anonymous.body.user).toBeNull();
    const me = await alice.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('alice@ajaia.dev');
  });

  it('rejects a wrong password with a clear message', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'alice@ajaia.dev', password: 'nope' })
      .expect(401);
    expect(res.body.error.message).toMatch(/incorrect/i);
  });
});

describe('documents', () => {
  it('creates, renames, edits and reopens a document with formatting intact', async () => {
    const doc = await createDoc(alice);
    expect(doc.title).toBe('Untitled document');

    const html =
      '<h2>Agenda</h2><p><strong>Bold</strong>, <em>italic</em> and <u>underlined</u></p><ul><li>One</li></ul>';
    const saved = await alice
      .patch(`/api/documents/${doc.id}`)
      .send({ title: 'Weekly sync', content: html, baseVersion: doc.version })
      .expect(200);
    expect(saved.body.version).toBe(doc.version + 1);

    const reopened = await alice.get(`/api/documents/${doc.id}`).expect(200);
    expect(reopened.body.title).toBe('Weekly sync');
    expect(reopened.body.content).toBe(html);
  });

  it('strips scripts and unknown markup before storing', async () => {
    const doc = await createDoc(alice, {
      content:
        '<p onclick="steal()">Hi<script>alert(1)</script></p><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>',
    });
    expect(doc.content).not.toMatch(/script|onclick|onerror|img|javascript:/);
    expect(doc.content).toContain('<p>Hi</p>');
  });

  it('refuses a stale save and returns the latest version instead of overwriting', async () => {
    const doc = await createDoc(alice);
    await alice
      .patch(`/api/documents/${doc.id}`)
      .send({ content: '<p>first</p>', baseVersion: doc.version })
      .expect(200);

    const stale = await alice
      .patch(`/api/documents/${doc.id}`)
      .send({ content: '<p>from an old tab</p>', baseVersion: doc.version })
      .expect(409);

    expect(stale.body.error.code).toBe('version_conflict');
    expect(stale.body.error.details.latest.content).toBe('<p>first</p>');
  });

  it('validates input', async () => {
    const doc = await createDoc(alice);
    await alice
      .patch(`/api/documents/${doc.id}`)
      .send({ title: 'x'.repeat(201), baseVersion: 1 })
      .expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: 'no version' }).expect(400);
    await alice.get('/api/documents/not-a-uuid').expect(404);
  });
});

describe('sharing', () => {
  it('keeps documents private until shared', async () => {
    const doc = await createDoc(alice, { title: 'Secret' });
    // 404 rather than 403: other users shouldn't learn the document exists
    await bob.get(`/api/documents/${doc.id}`).expect(404);

    const list = await bob.get('/api/documents').expect(200);
    expect(list.body.shared.map((d: { id: string }) => d.id)).not.toContain(doc.id);
  });

  it('gives editors write access and viewers read-only access', async () => {
    const doc = await createDoc(alice, { title: 'Roadmap' });
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.dev', role: 'editor' }).expect(200);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.dev', role: 'viewer' }).expect(200);

    const bobsList = await bob.get('/api/documents').expect(200);
    expect(bobsList.body.shared).toContainEqual(expect.objectContaining({ id: doc.id, role: 'editor' }));
    expect(bobsList.body.owned.map((d: { id: string }) => d.id)).not.toContain(doc.id);

    await bob.patch(`/api/documents/${doc.id}`).send({ content: '<p>Bob was here</p>', baseVersion: 1 }).expect(200);

    const carolView = await carol.get(`/api/documents/${doc.id}`).expect(200);
    expect(carolView.body.role).toBe('viewer');
    expect(carolView.body.content).toBe('<p>Bob was here</p>');
    expect(carolView.body.updatedBy.name).toBe('Bob Okafor');

    await carol.patch(`/api/documents/${doc.id}`).send({ content: '<p>nope</p>', baseVersion: 2 }).expect(403);
  });

  it('only lets the owner manage access or delete', async () => {
    const doc = await createDoc(alice);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.dev', role: 'editor' }).expect(200);

    await bob.post(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.dev', role: 'editor' }).expect(403);
    await bob.delete(`/api/documents/${doc.id}`).expect(403);
  });

  it('revokes access', async () => {
    const doc = await createDoc(alice);
    const shared = await alice
      .post(`/api/documents/${doc.id}/shares`)
      .send({ email: 'bob@ajaia.dev', role: 'viewer' })
      .expect(200);
    const bobId = shared.body.shares[0].user.id;

    await alice.delete(`/api/documents/${doc.id}/shares/${bobId}`).expect(200);
    await bob.get(`/api/documents/${doc.id}`).expect(404);
  });

  it('explains unknown recipients and self-shares', async () => {
    const doc = await createDoc(alice);
    const unknown = await alice
      .post(`/api/documents/${doc.id}/shares`)
      .send({ email: 'nobody@ajaia.dev', role: 'viewer' })
      .expect(404);
    expect(unknown.body.error.message).toContain('nobody@ajaia.dev');

    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: 'alice@ajaia.dev', role: 'viewer' }).expect(400);
  });
});

import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db.js';
import { DocumentService, REVISION_WINDOW_MS } from '../src/services/documents.js';
import { makeTestApp } from './helpers.js';

function serviceWithClock() {
  const db = openDatabase(':memory:');
  let now = Date.parse('2026-01-01T09:00:00Z');
  const docs = new DocumentService(db, () => now);
  const users = db.prepare('SELECT id, email, name FROM users ORDER BY email').all() as Array<{ id: string }>;
  const [alice, bob] = users as [{ id: string }, { id: string }];
  return { docs, alice: alice.id, bob: bob.id, advance: (ms: number) => (now += ms) };
}

describe('revision history', () => {
  it('folds a burst of saves by one person into a single revision', () => {
    const { docs, alice, advance } = serviceWithClock();
    let doc = docs.create(alice, { title: 'Draft' });

    for (const word of ['one', 'two', 'three']) {
      advance(10_000);
      doc = docs.update(doc.id, alice, { content: `<p>${word}</p>`, baseVersion: doc.version });
    }

    const revisions = docs.listRevisions(doc.id, alice);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ version: doc.version });
    expect(docs.getRevision(doc.id, revisions[0]!.id, alice).content).toBe('<p>three</p>');
  });

  it('starts a new revision when the author changes or the window passes', () => {
    const { docs, alice, bob, advance } = serviceWithClock();
    let doc = docs.create(alice);
    docs.share(doc.id, alice, { id: bob, email: 'bob@ajaia.dev', name: 'Bob' }, 'editor');

    doc = docs.update(doc.id, bob, { content: '<p>bob</p>', baseVersion: doc.version });
    advance(REVISION_WINDOW_MS + 1);
    doc = docs.update(doc.id, bob, { content: '<p>bob later</p>', baseVersion: doc.version });

    const authors = docs.listRevisions(doc.id, alice).map((r) => r.author?.id);
    expect(authors).toEqual([bob, bob, alice]);
  });
});

describe('revision API', () => {
  it('restores an old version as a new save, without losing the current one', async () => {
    const { signIn } = makeTestApp();
    const alice = await signIn('alice@ajaia.dev');
    const bob = await signIn('bob@ajaia.dev');

    const created = await alice.post('/api/documents').send({ content: '<p>original</p>' }).expect(201);
    const id = created.body.id;
    await alice.post(`/api/documents/${id}/shares`).send({ email: 'bob@ajaia.dev', role: 'editor' }).expect(200);
    const edited = await bob
      .patch(`/api/documents/${id}`)
      .send({ content: '<p>rewritten by bob</p>', baseVersion: created.body.version })
      .expect(200);

    const list = await alice.get(`/api/documents/${id}/revisions`).expect(200);
    expect(list.body.revisions).toHaveLength(2);
    const original = list.body.revisions.at(-1);
    expect(original.author.name).toBe('Alice Moreno');

    const restored = await alice
      .post(`/api/documents/${id}/revisions/${original.id}/restore`)
      .send({ baseVersion: edited.body.version })
      .expect(200);
    expect(restored.body.content).toBe('<p>original</p>');

    // Bob's version is still in history, so the restore can itself be undone.
    const after = await alice.get(`/api/documents/${id}/revisions`).expect(200);
    const contents = await Promise.all(
      after.body.revisions.map((r: { id: string }) => alice.get(`/api/documents/${id}/revisions/${r.id}`)),
    );
    expect(contents.map((r) => r.body.content)).toContain('<p>rewritten by bob</p>');
  });

  it('applies the same access rules as the document', async () => {
    const { signIn } = makeTestApp();
    const alice = await signIn('alice@ajaia.dev');
    const carol = await signIn('carol@ajaia.dev');

    const doc = await alice.post('/api/documents').send({}).expect(201);
    await carol.get(`/api/documents/${doc.body.id}/revisions`).expect(404);

    await alice
      .post(`/api/documents/${doc.body.id}/shares`)
      .send({ email: 'carol@ajaia.dev', role: 'viewer' })
      .expect(200);
    const list = await carol.get(`/api/documents/${doc.body.id}/revisions`).expect(200);
    const revisionId = list.body.revisions[0].id;

    await carol
      .post(`/api/documents/${doc.body.id}/revisions/${revisionId}/restore`)
      .send({ baseVersion: doc.body.version })
      .expect(403);
  });
});

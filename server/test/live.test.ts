import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../src/services/hub.js';
import { makeTestApp } from './helpers.js';

/** Collects what the hub writes to a fake response, parsed back into events. */
function fakeStream() {
  const chunks: string[] = [];
  let ended = false;
  return {
    res: {
      write: (chunk: string) => {
        chunks.push(chunk);
        return true;
      },
      end: () => {
        ended = true;
        return undefined as never;
      },
    },
    events: () =>
      chunks
        .filter((c) => c.startsWith('event:'))
        .map((c) => JSON.parse(c.split('\ndata: ')[1]!) as { type: string; users?: Array<{ name: string }> }),
    get ended() {
      return ended;
    },
  };
}

const alice = { id: 'a', email: 'alice@ajaia.dev', name: 'Alice' };
const bob = { id: 'b', email: 'bob@ajaia.dev', name: 'Bob' };

describe('DocumentHub', () => {
  it('tracks who is in a document, counting each person once', () => {
    const hub = new DocumentHub();
    const a1 = fakeStream();
    const b = fakeStream();

    hub.join('doc', alice, a1.res);
    const leaveSecondTab = hub.join('doc', alice, fakeStream().res);
    const leaveBob = hub.join('doc', bob, b.res);

    expect(hub.presence('doc').map((u) => u.name)).toEqual(['Alice', 'Bob']);
    leaveSecondTab();
    leaveBob();
    expect(hub.presence('doc').map((u) => u.name)).toEqual(['Alice']);

    const lastPresence = a1
      .events()
      .filter((e) => e.type === 'presence')
      .at(-1);
    expect(lastPresence?.users?.map((u) => u.name)).toEqual(['Alice']);
  });

  it('only sends saves to the document they belong to', () => {
    const hub = new DocumentHub();
    const here = fakeStream();
    const elsewhere = fakeStream();
    hub.join('doc-1', alice, here.res);
    hub.join('doc-2', bob, elsewhere.res);

    hub.publishSave({ id: 'doc-1', role: 'owner', owner: { id: 'a', name: 'Alice' }, content: '<p>x</p>' } as never);

    const saved = here.events().find((e) => e.type === 'saved') as { document?: Record<string, unknown> } | undefined;
    expect(saved?.document?.content).toBe('<p>x</p>');
    // Each listener has their own role, so the saver's must not leak into the broadcast.
    expect(saved?.document).not.toHaveProperty('role');
    expect(elsewhere.events().map((e) => e.type)).not.toContain('saved');
  });

  it('closes the stream of someone whose access was removed', () => {
    const hub = new DocumentHub();
    const b = fakeStream();
    hub.join('doc', bob, b.res);

    hub.kick('doc', bob.id);

    expect(b.events().at(-1)?.type).toBe('access-revoked');
    expect(b.ended).toBe(true);
  });
});

describe('GET /api/documents/:id/events', () => {
  it('refuses to open a stream for a document the caller cannot see', async () => {
    const { signIn } = makeTestApp();
    const owner = await signIn('alice@ajaia.dev');
    const stranger = await signIn('carol@ajaia.dev');
    const doc = await owner.post('/api/documents').send({}).expect(201);

    await stranger.get(`/api/documents/${doc.body.id}/events`).expect(404);
  });
});

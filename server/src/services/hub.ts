import type { Response } from 'express';
import type { User } from './auth.js';
import type { DocumentView } from './documents.js';

/**
 * Server-sent events per document: who has it open, and every save as it lands.
 *
 * SSE rather than websockets because the traffic is one-way (saves still go
 * through PATCH, where versioning and permissions live), it reuses the session
 * cookie, and it passes through every proxy a free host puts in front of us.
 *
 * State is in memory, which is correct for a single process. Running more than
 * one instance would need a shared pub/sub (Redis, Postgres LISTEN) behind this.
 */

/**
 * What a save broadcasts. Deliberately not the whole DocumentView: that carries
 * the saver's role, and every listener has their own.
 */
export type LiveDocument = Pick<DocumentView, 'id' | 'title' | 'content' | 'version' | 'updatedAt' | 'updatedBy'>;

export type HubEvent =
  | { type: 'presence'; users: Array<Pick<User, 'id' | 'name'>> }
  | { type: 'saved'; document: LiveDocument }
  | { type: 'access-revoked' }
  | { type: 'deleted' };

interface Connection {
  id: number;
  user: User;
  res: Pick<Response, 'write' | 'end'>;
}

export class DocumentHub {
  private rooms = new Map<string, Map<number, Connection>>();
  private nextId = 1;

  join(documentId: string, user: User, res: Connection['res']): () => void {
    const room = this.rooms.get(documentId) ?? new Map<number, Connection>();
    this.rooms.set(documentId, room);

    const id = this.nextId++;
    room.set(id, { id, user, res });
    this.broadcastPresence(documentId);

    return () => {
      room.delete(id);
      if (room.size === 0) this.rooms.delete(documentId);
      else this.broadcastPresence(documentId);
    };
  }

  /** Everyone currently looking at the document, one entry per person even with several tabs open. */
  presence(documentId: string): Array<Pick<User, 'id' | 'name'>> {
    const seen = new Map<string, Pick<User, 'id' | 'name'>>();
    for (const { user } of this.rooms.get(documentId)?.values() ?? []) {
      seen.set(user.id, { id: user.id, name: user.name });
    }
    return [...seen.values()];
  }

  publishSave({ id, title, content, version, updatedAt, updatedBy }: DocumentView) {
    this.send(id, { type: 'saved', document: { id, title, content, version, updatedAt, updatedBy } });
  }

  /** Closes a user's open streams, e.g. after their access was removed. */
  kick(documentId: string, userId: string) {
    for (const connection of this.rooms.get(documentId)?.values() ?? []) {
      if (connection.user.id !== userId) continue;
      write(connection, { type: 'access-revoked' });
      connection.res.end();
    }
  }

  closeRoom(documentId: string) {
    for (const connection of this.rooms.get(documentId)?.values() ?? []) {
      write(connection, { type: 'deleted' });
      connection.res.end();
    }
    this.rooms.delete(documentId);
  }

  heartbeat() {
    for (const room of this.rooms.values()) {
      for (const connection of room.values()) connection.res.write(': ping\n\n');
    }
  }

  private broadcastPresence(documentId: string) {
    this.send(documentId, { type: 'presence', users: this.presence(documentId) });
  }

  private send(documentId: string, event: HubEvent) {
    for (const connection of this.rooms.get(documentId)?.values() ?? []) write(connection, event);
  }
}

function write(connection: Connection, event: HubEvent) {
  connection.res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

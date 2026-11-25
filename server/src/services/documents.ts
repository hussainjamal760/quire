import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import { forbidden, HttpError, notFound, badRequest } from '../lib/errors.js';
import { previewHtml, sanitizeDocumentHtml } from '../lib/sanitize.js';
import type { User } from './auth.js';

export type ShareRole = 'viewer' | 'editor';
export type Role = 'owner' | ShareRole;

export const permissions = {
  canEdit: (role: Role) => role === 'owner' || role === 'editor',
  canManage: (role: Role) => role === 'owner',
};

export interface DocumentSummary {
  id: string;
  title: string;
  role: Role;
  owner: { id: string; name: string };
  updatedAt: string;
}

export interface DocumentListItem extends DocumentSummary {
  /** First few blocks of the document, for thumbnails. Already sanitized. */
  preview: string;
}

export interface DocumentView extends DocumentSummary {
  content: string;
  version: number;
  createdAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface Share {
  user: User;
  role: ShareRole;
}

export interface RevisionSummary {
  id: string;
  version: number;
  title: string;
  savedAt: string;
  author: { id: string; name: string } | null;
}

export interface Revision extends RevisionSummary {
  content: string;
}

export const DEFAULT_TITLE = 'Untitled document';

/** Saves by the same person closer together than this are folded into one revision. */
export const REVISION_WINDOW_MS = 5 * 60 * 1000;

interface DocumentRow {
  id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
  role: Role;
}

// Resolves the caller's role in the same query, so "can't see it" and "doesn't exist" look identical.
const SELECT_WITH_ROLE = `
  SELECT d.*, o.name AS owner_name, ub.name AS updated_by_name,
         CASE WHEN d.owner_id = @userId THEN 'owner' ELSE s.role END AS role
    FROM documents d
    JOIN users o ON o.id = d.owner_id
    LEFT JOIN users ub ON ub.id = d.updated_by
    LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = @userId
`;

function toSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    role: row.role,
    owner: { id: row.owner_id, name: row.owner_name },
    updatedAt: row.updated_at,
  };
}

function toView(row: DocumentRow): DocumentView {
  return {
    ...toSummary(row),
    content: row.content,
    version: row.version,
    createdAt: row.created_at,
    updatedBy: row.updated_by ? { id: row.updated_by, name: row.updated_by_name ?? 'Unknown' } : null,
  };
}

interface RevisionRow {
  id: string;
  version: number;
  title: string;
  saved_at: number;
  author_id: string | null;
  author_name: string | null;
}

function toRevisionSummary(row: RevisionRow): RevisionSummary {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    savedAt: new Date(row.saved_at).toISOString(),
    author: row.author_id ? { id: row.author_id, name: row.author_name ?? 'Unknown' } : null,
  };
}

function normalizeTitle(title: string | undefined): string {
  const trimmed = title?.trim();
  return trimmed ? trimmed : DEFAULT_TITLE;
}

export class DocumentService {
  constructor(
    private readonly db: DB,
    private readonly now: () => number = Date.now,
  ) {}

  listFor(userId: string): { owned: DocumentListItem[]; shared: DocumentListItem[] } {
    const rows = this.db
      .prepare(
        `${SELECT_WITH_ROLE}
          WHERE d.owner_id = @userId OR s.user_id IS NOT NULL
          ORDER BY d.updated_at DESC`,
      )
      .all({ userId }) as DocumentRow[];

    const summaries = rows.map((row) => ({ ...toSummary(row), preview: previewHtml(row.content) }));
    return {
      owned: summaries.filter((doc) => doc.role === 'owner'),
      shared: summaries.filter((doc) => doc.role !== 'owner'),
    };
  }

  get(documentId: string, userId: string): DocumentView {
    const row = this.db
      .prepare(`${SELECT_WITH_ROLE} WHERE d.id = @documentId AND (d.owner_id = @userId OR s.user_id IS NOT NULL)`)
      .get({ documentId, userId }) as DocumentRow | undefined;

    if (!row) throw notFound();
    return toView(row);
  }

  create(ownerId: string, input: { title?: string; content?: string } = {}): DocumentView {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO documents (id, owner_id, title, content, updated_by) VALUES (?, ?, ?, ?, ?)')
      .run(id, ownerId, normalizeTitle(input.title), sanitizeDocumentHtml(input.content ?? ''), ownerId);
    const doc = this.get(id, ownerId);
    this.recordRevision(doc, ownerId);
    return doc;
  }

  /**
   * Optimistic concurrency: the caller sends the version it last saw. If someone
   * else saved in between, we refuse with 409 and include the latest copy so the
   * client can decide what to do instead of silently overwriting their work.
   */
  update(
    documentId: string,
    userId: string,
    changes: { title?: string; content?: string; baseVersion: number },
  ): DocumentView {
    const current = this.get(documentId, userId);
    if (!permissions.canEdit(current.role)) throw forbidden('You have view-only access to this document.');

    if (changes.title === undefined && changes.content === undefined) {
      throw badRequest('Nothing to update.');
    }

    const title = changes.title === undefined ? current.title : normalizeTitle(changes.title);
    const content = changes.content === undefined ? current.content : sanitizeDocumentHtml(changes.content);

    const result = this.db
      .prepare(
        `UPDATE documents
            SET title = ?, content = ?, version = version + 1, updated_by = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND version = ?`,
      )
      .run(title, content, userId, documentId, changes.baseVersion);

    if (result.changes === 0) {
      throw new HttpError(409, 'This document was changed by someone else.', 'version_conflict', {
        latest: this.get(documentId, userId),
      });
    }

    const saved = this.get(documentId, userId);
    this.recordRevision(saved, userId);
    return saved;
  }

  listRevisions(documentId: string, userId: string): RevisionSummary[] {
    this.get(documentId, userId); // access check
    const rows = this.db
      .prepare(
        `SELECT r.id, r.version, r.title, r.saved_at, r.author_id, u.name AS author_name
           FROM document_revisions r LEFT JOIN users u ON u.id = r.author_id
          WHERE r.document_id = ?
          ORDER BY r.saved_at DESC, r.version DESC
          LIMIT 100`,
      )
      .all(documentId) as RevisionRow[];
    return rows.map(toRevisionSummary);
  }

  getRevision(documentId: string, revisionId: string, userId: string): Revision {
    this.get(documentId, userId);
    const row = this.db
      .prepare(
        `SELECT r.*, u.name AS author_name
           FROM document_revisions r LEFT JOIN users u ON u.id = r.author_id
          WHERE r.document_id = ? AND r.id = ?`,
      )
      .get(documentId, revisionId) as (RevisionRow & { content: string }) | undefined;
    if (!row) throw notFound('Version not found.');
    return { ...toRevisionSummary(row), content: row.content };
  }

  /** Restoring is just another save, so it gets its own revision and can itself be undone. */
  restoreRevision(documentId: string, revisionId: string, userId: string, baseVersion: number): DocumentView {
    const revision = this.getRevision(documentId, revisionId, userId);
    return this.update(documentId, userId, { title: revision.title, content: revision.content, baseVersion });
  }

  private recordRevision(doc: DocumentView, authorId: string) {
    const now = this.now();
    const latest = this.db
      .prepare(
        `SELECT id, author_id, started_at FROM document_revisions
          WHERE document_id = ? ORDER BY saved_at DESC, version DESC LIMIT 1`,
      )
      .get(doc.id) as { id: string; author_id: string | null; started_at: number } | undefined;

    if (latest && latest.author_id === authorId && now - latest.started_at < REVISION_WINDOW_MS) {
      this.db
        .prepare('UPDATE document_revisions SET version = ?, title = ?, content = ?, saved_at = ? WHERE id = ?')
        .run(doc.version, doc.title, doc.content, now, latest.id);
      return;
    }

    this.db
      .prepare(
        `INSERT INTO document_revisions (id, document_id, version, title, content, author_id, started_at, saved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), doc.id, doc.version, doc.title, doc.content, authorId, now, now);
  }

  delete(documentId: string, userId: string) {
    const doc = this.get(documentId, userId);
    if (!permissions.canManage(doc.role)) throw forbidden('Only the owner can delete this document.');
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(documentId);
  }

  listShares(documentId: string, userId: string): Share[] {
    this.get(documentId, userId); // access check
    const rows = this.db
      .prepare(
        `SELECT u.id, u.email, u.name, s.role
           FROM document_shares s JOIN users u ON u.id = s.user_id
          WHERE s.document_id = ?
          ORDER BY s.created_at`,
      )
      .all(documentId) as Array<User & { role: ShareRole }>;

    return rows.map(({ role, ...user }) => ({ user, role }));
  }

  /** Grants or updates access. Re-sharing with a new role just changes the role. */
  share(documentId: string, ownerId: string, target: User, role: ShareRole): Share[] {
    const doc = this.get(documentId, ownerId);
    if (!permissions.canManage(doc.role)) throw forbidden('Only the owner can change who has access.');
    if (target.id === ownerId) throw badRequest('You already own this document.');

    this.db
      .prepare(
        `INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)
         ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
      )
      .run(documentId, target.id, role);

    return this.listShares(documentId, ownerId);
  }

  revoke(documentId: string, ownerId: string, targetUserId: string): Share[] {
    const doc = this.get(documentId, ownerId);
    if (!permissions.canManage(doc.role)) throw forbidden('Only the owner can change who has access.');

    this.db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?').run(documentId, targetUserId);
    return this.listShares(documentId, ownerId);
  }
}

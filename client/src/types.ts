// Shapes the API returns, shared by both backends (HTTP and the in-browser demo).
export type Role = 'owner' | 'editor' | 'viewer';
export type ShareRole = Exclude<Role, 'owner'>;

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  role: Role;
  owner: { id: string; name: string };
  updatedAt: string;
}

export interface DocumentListItem extends DocumentSummary {
  preview: string;
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

export interface DocumentView extends DocumentSummary {
  content: string;
  version: number;
  createdAt: string;
  updatedBy: { id: string; name: string } | null;
}

/** What arrives over the live channel when someone saves: content fields only. */
export type LiveDocument = Pick<DocumentView, 'id' | 'title' | 'content' | 'version' | 'updatedAt' | 'updatedBy'>;

export interface Share {
  user: User;
  role: ShareRole;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

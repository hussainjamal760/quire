import type {
  DocumentListItem,
  DocumentView,
  LiveDocument,
  Revision,
  RevisionSummary,
  Share,
  ShareRole,
  User,
} from '../types';

/** Everything the UI asks of a backend. The HTTP client and the in-browser demo both implement it. */
export interface Api {
  me(): Promise<User | null>;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;

  listDocuments(): Promise<{ owned: DocumentListItem[]; shared: DocumentListItem[] }>;
  getDocument(id: string): Promise<DocumentView>;
  createDocument(): Promise<DocumentView>;
  updateDocument(
    id: string,
    changes: { title?: string; content?: string; baseVersion: number },
    options?: { keepalive?: boolean },
  ): Promise<DocumentView>;
  deleteDocument(id: string): Promise<void>;
  importFile(file: File): Promise<DocumentView>;

  listRevisions(id: string): Promise<RevisionSummary[]>;
  getRevision(id: string, revisionId: string): Promise<Revision>;
  restoreRevision(id: string, revisionId: string, baseVersion: number): Promise<DocumentView>;

  listShares(id: string): Promise<Share[]>;
  share(id: string, email: string, role: ShareRole): Promise<Share[]>;
  revoke(id: string, userId: string): Promise<Share[]>;
}

export interface ChannelHandlers {
  onPresence(users: Array<{ id: string; name: string }>): void;
  onSaved(document: LiveDocument): void;
  onGone(reason: 'access-revoked' | 'deleted'): void;
  onConnection(connected: boolean): void;
}

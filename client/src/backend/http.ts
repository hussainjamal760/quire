import {
  ApiError,
  type DocumentListItem,
  type DocumentView,
  type LiveDocument,
  type Revision,
  type RevisionSummary,
  type Share,
  type ShareRole,
  type User,
} from '../types';
import type { Api, ChannelHandlers } from './contract';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: isForm ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'network', 'Can’t reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = body?.error ?? {};
    throw new ApiError(
      res.status,
      error.code ?? 'error',
      error.message ?? `Request failed (${res.status}).`,
      error.details,
    );
  }
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api: Api = {
  me: () => request<{ user: User | null }>('/auth/me').then((r) => r.user),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', json('POST', { email, password })).then((r) => r.user),
  logout: () => request<void>('/auth/logout', json('POST')),

  listDocuments: () => request<{ owned: DocumentListItem[]; shared: DocumentListItem[] }>('/documents'),
  getDocument: (id: string) => request<DocumentView>(`/documents/${id}`),
  createDocument: () => request<DocumentView>('/documents', json('POST', {})),
  updateDocument: (
    id: string,
    changes: { title?: string; content?: string; baseVersion: number },
    // keepalive lets the request outlive the page, for the save that runs as a tab closes
    { keepalive = false } = {},
  ) => request<DocumentView>(`/documents/${id}`, { ...json('PATCH', changes), keepalive }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, json('DELETE')),

  importFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<DocumentView>('/documents/import', { method: 'POST', body: form });
  },

  listRevisions: (id: string) =>
    request<{ revisions: RevisionSummary[] }>(`/documents/${id}/revisions`).then((r) => r.revisions),
  getRevision: (id: string, revisionId: string) => request<Revision>(`/documents/${id}/revisions/${revisionId}`),
  restoreRevision: (id: string, revisionId: string, baseVersion: number) =>
    request<DocumentView>(`/documents/${id}/revisions/${revisionId}/restore`, json('POST', { baseVersion })),

  listShares: (id: string) => request<{ shares: Share[] }>(`/documents/${id}/shares`).then((r) => r.shares),
  share: (id: string, email: string, role: ShareRole) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares`, json('POST', { email, role })).then((r) => r.shares),
  revoke: (id: string, userId: string) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares/${userId}`, json('DELETE')).then((r) => r.shares),
};

/** Server-sent events for one document. EventSource reconnects on its own. */
export function openChannel(documentId: string, handlers: ChannelHandlers): () => void {
  const source = new EventSource(`/api/documents/${documentId}/events`);
  source.onopen = () => handlers.onConnection(true);
  source.onerror = () => handlers.onConnection(false);
  source.addEventListener('presence', (event) => handlers.onPresence(JSON.parse(event.data).users));
  source.addEventListener('saved', (event) => handlers.onSaved(JSON.parse(event.data).document as LiveDocument));
  for (const reason of ['access-revoked', 'deleted'] as const) {
    source.addEventListener(reason, () => {
      source.close();
      handlers.onGone(reason);
    });
  }
  return () => source.close();
}

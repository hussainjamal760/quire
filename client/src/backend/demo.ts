/**
 * The in-browser backend for the static demo build.
 *
 * It mirrors the server's rules (roles, versioned saves and 409 conflicts,
 * revision grouping, sanitizing, import limits) against browser storage, so
 * the same UI runs with no Node process behind it:
 *
 * - documents, shares and history live in localStorage, shared by every tab;
 * - who is signed in lives in sessionStorage, so each tab can be a different person;
 * - presence and saves travel between tabs on a BroadcastChannel.
 *
 * Open Alice in one tab and Bob in another to see sharing and live edits.
 * Nothing leaves the browser; the real deployment uses server/.
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import {
  ApiError,
  type DocumentListItem,
  type DocumentView,
  type LiveDocument,
  type Revision,
  type RevisionSummary,
  type Role,
  type Share,
  type ShareRole,
  type User,
} from '../types';
import type { Api, ChannelHandlers } from './contract';

// --- storage ------------------------------------------------------------------

interface DocRow {
  id: string;
  ownerId: string;
  title: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}
interface ShareRow {
  documentId: string;
  userId: string;
  role: ShareRole;
  createdAt: number;
}
interface RevisionRow {
  id: string;
  documentId: string;
  version: number;
  title: string;
  content: string;
  authorId: string | null;
  startedAt: number;
  savedAt: number;
}
interface Data {
  users: Array<User & { password: string }>;
  docs: DocRow[];
  shares: ShareRow[];
  revisions: RevisionRow[];
}

const DATA_KEY = 'quire-demo-data-v1';
const SESSION_KEY = 'quire-demo-user';
const DEMO_PASSWORD = 'quire-demo';
const REVISION_WINDOW_MS = 5 * 60 * 1000;
const MAX_UPLOAD = 2 * 1024 * 1024;

/** Browser storage can be missing or throw in sandboxed frames; fall back to memory. */
function safeStorage(kind: 'localStorage' | 'sessionStorage') {
  const memory = new Map<string, string>();
  const get = (key: string) => {
    try {
      return window[kind].getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  };
  const set = (key: string, value: string | null) => {
    try {
      if (value === null) window[kind].removeItem(key);
      else window[kind].setItem(key, value);
    } catch {
      if (value === null) memory.delete(key);
      else memory.set(key, value);
    }
  };
  return { get, set };
}
const local = safeStorage('localStorage');
const session = safeStorage('sessionStorage');

const uuid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (+c / 4)))).toString(16),
      );
const nowIso = () => new Date().toISOString();

// Every operation re-reads storage, because another tab may have written since.
function load(): Data {
  const raw = local.get(DATA_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Data;
    } catch {
      // corrupted: fall through and reseed
    }
  }
  const seeded = seed();
  save(seeded);
  return seeded;
}
function save(data: Data) {
  local.set(DATA_KEY, JSON.stringify(data));
}

/** A tiny pause so the UI's saving states are visible, as they would be over a network. */
const settle = <T>(value: T, ms = 60) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

// --- sanitizing -------------------------------------------------------------------

const ALLOWED_TAGS = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'strong',
  'em',
  'u',
  's',
  'code',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'a',
];

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

function sanitize(html: string): string {
  // Same allowlist as the server. Map the older tags the importers produce first.
  const normalized = html
    .replace(/<(\/?)b(\s|>)/gi, '<$1strong$2')
    .replace(/<(\/?)i(\s|>)/gi, '<$1em$2')
    .replace(/<(\/?)(?:strike|del)(\s|>)/gi, '<$1s$2')
    .replace(/<(\/?)h[4-6](\s|>)/gi, '<$1h3$2');
  return DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'start'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  }).trim();
}

function previewHtml(html: string, budget = 600): string {
  if (html.length <= budget) return html;
  let cut = 0;
  for (const match of html.matchAll(/<\/(?:p|h[1-3]|ul|ol|blockquote|pre)>/g)) {
    const end = match.index + match[0].length;
    if (end > budget && cut > 0) break;
    cut = end;
  }
  return sanitize(html.slice(0, cut || budget));
}

// --- rules ------------------------------------------------------------------------

function currentUser(data: Data): User {
  const id = session.get(SESSION_KEY);
  const user = data.users.find((u) => u.id === id);
  if (!user) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
  return { id: user.id, email: user.email, name: user.name };
}

const userRef = (data: Data, id: string | null) => {
  const user = data.users.find((u) => u.id === id);
  return user ? { id: user.id, name: user.name } : null;
};

function roleOf(data: Data, doc: DocRow, userId: string): Role | null {
  if (doc.ownerId === userId) return 'owner';
  return data.shares.find((s) => s.documentId === doc.id && s.userId === userId)?.role ?? null;
}

/** Like the server: no access looks exactly like no document. */
function accessible(data: Data, id: string, userId: string): { doc: DocRow; role: Role } {
  const doc = data.docs.find((d) => d.id === id);
  const role = doc ? roleOf(data, doc, userId) : null;
  if (!doc || !role) throw new ApiError(404, 'not_found', 'Document not found.');
  return { doc, role };
}

function view(data: Data, doc: DocRow, role: Role): DocumentView {
  return {
    id: doc.id,
    title: doc.title,
    role,
    owner: userRef(data, doc.ownerId)!,
    updatedAt: doc.updatedAt,
    content: doc.content,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedBy: userRef(data, doc.updatedBy),
  };
}

const normalizeTitle = (title?: string) => title?.trim() || 'Untitled document';

function recordRevision(data: Data, doc: DocRow, authorId: string) {
  const now = Date.now();
  const latest = data.revisions
    .filter((r) => r.documentId === doc.id)
    .sort((a, b) => b.savedAt - a.savedAt || b.version - a.version)[0];

  if (latest && latest.authorId === authorId && now - latest.startedAt < REVISION_WINDOW_MS) {
    Object.assign(latest, { version: doc.version, title: doc.title, content: doc.content, savedAt: now });
    return;
  }
  data.revisions.push({
    id: uuid(),
    documentId: doc.id,
    version: doc.version,
    title: doc.title,
    content: doc.content,
    authorId,
    startedAt: now,
    savedAt: now,
  });
}

function createDoc(data: Data, ownerId: string, title: string | undefined, content: string): DocRow {
  const at = nowIso();
  const doc: DocRow = {
    id: uuid(),
    ownerId,
    title: normalizeTitle(title),
    content: sanitize(content),
    version: 1,
    createdAt: at,
    updatedAt: at,
    updatedBy: ownerId,
  };
  data.docs.push(doc);
  recordRevision(data, doc, ownerId);
  return doc;
}

function updateDoc(
  data: Data,
  id: string,
  user: User,
  changes: { title?: string; content?: string; baseVersion: number },
): DocumentView {
  const { doc, role } = accessible(data, id, user.id);
  if (role === 'viewer') throw new ApiError(403, 'forbidden', 'You have view-only access to this document.');
  if (doc.version !== changes.baseVersion) {
    throw new ApiError(409, 'version_conflict', 'This document was changed by someone else.', {
      latest: view(data, doc, role),
    });
  }
  if (changes.title !== undefined) doc.title = normalizeTitle(changes.title);
  if (changes.content !== undefined) doc.content = sanitize(changes.content);
  doc.version += 1;
  doc.updatedAt = nowIso();
  doc.updatedBy = user.id;
  recordRevision(data, doc, user.id);
  save(data);

  const saved = view(data, doc, role);
  broadcast({ type: 'saved', document: live(saved) });
  return saved;
}

function sharesOf(data: Data, documentId: string): Share[] {
  return data.shares
    .filter((s) => s.documentId === documentId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => {
      const u = data.users.find((x) => x.id === s.userId)!;
      return { user: { id: u.id, email: u.email, name: u.name }, role: s.role };
    });
}

function requireOwner(role: Role, message: string) {
  if (role !== 'owner') throw new ApiError(403, 'forbidden', message);
}

// --- import -------------------------------------------------------------------------

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function fileToHtml(file: File): Promise<string> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (ext === '.txt') {
    return (await file.text())
      .replace(/\r\n?/g, '\n')
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => `<p>${escapeHtml(b).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }
  if (ext === '.md' || ext === '.markdown') return marked.parse(await file.text(), { gfm: true });
  if (ext === '.docx') {
    try {
      const { default: mammoth } = await import('mammoth/mammoth.browser.min.js');
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      return value;
    } catch {
      throw new ApiError(
        400,
        'bad_request',
        'That .docx file could not be read. It may be corrupted or password-protected.',
      );
    }
  }
  throw new ApiError(400, 'bad_request', 'Unsupported file type. Upload one of: .txt, .md, .markdown, .docx.');
}

// --- the API --------------------------------------------------------------------------

export const api: Api = {
  async me() {
    const data = load();
    try {
      return settle(currentUser(data), 0);
    } catch {
      return null;
    }
  },

  async login(email, password) {
    const data = load();
    const user = data.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) {
      throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect.');
    }
    session.set(SESSION_KEY, user.id);
    return settle({ id: user.id, email: user.email, name: user.name });
  },

  async logout() {
    session.set(SESSION_KEY, null);
  },

  async listDocuments() {
    const data = load();
    const me = currentUser(data);
    const items: DocumentListItem[] = data.docs
      .map((doc) => ({ doc, role: roleOf(data, doc, me.id) }))
      .filter((x): x is { doc: DocRow; role: Role } => x.role !== null)
      .sort((a, b) => b.doc.updatedAt.localeCompare(a.doc.updatedAt))
      .map(({ doc, role }) => {
        const { content: _content, version: _v, createdAt: _c, updatedBy: _u, ...summary } = view(data, doc, role);
        return { ...summary, preview: previewHtml(doc.content) };
      });
    return settle({ owned: items.filter((d) => d.role === 'owner'), shared: items.filter((d) => d.role !== 'owner') });
  },

  async getDocument(id) {
    const data = load();
    const { doc, role } = accessible(data, id, currentUser(data).id);
    return settle(view(data, doc, role));
  },

  async createDocument() {
    const data = load();
    const me = currentUser(data);
    const doc = createDoc(data, me.id, undefined, '');
    save(data);
    return settle(view(data, doc, 'owner'));
  },

  async updateDocument(id, changes) {
    if (changes.title !== undefined && changes.title.length > 200) {
      throw new ApiError(400, 'validation', 'title: Title must be 200 characters or fewer.');
    }
    if (changes.title === undefined && changes.content === undefined) {
      throw new ApiError(400, 'bad_request', 'Nothing to update.');
    }
    await settle(null, 120);
    const data = load();
    return updateDoc(data, id, currentUser(data), changes);
  },

  async deleteDocument(id) {
    const data = load();
    const { role } = accessible(data, id, currentUser(data).id);
    requireOwner(role, 'Only the owner can delete this document.');
    data.docs = data.docs.filter((d) => d.id !== id);
    data.shares = data.shares.filter((s) => s.documentId !== id);
    data.revisions = data.revisions.filter((r) => r.documentId !== id);
    save(data);
    broadcast({ type: 'deleted', documentId: id });
  },

  async importFile(file) {
    if (file.size > MAX_UPLOAD) throw new ApiError(400, 'upload', 'File is larger than the 2 MB limit.');
    const html = await fileToHtml(file);
    if (!html.trim()) throw new ApiError(400, 'bad_request', 'That file has no text to import.');

    const data = load();
    const me = currentUser(data);
    const base = file.name.slice(0, file.name.lastIndexOf('.')).replace(/[_-]+/g, ' ').trim();
    const doc = createDoc(data, me.id, base.slice(0, 200) || 'Imported document', html);
    save(data);
    return settle(view(data, doc, 'owner'), 200);
  },

  async listRevisions(id) {
    const data = load();
    accessible(data, id, currentUser(data).id);
    const list: RevisionSummary[] = data.revisions
      .filter((r) => r.documentId === id)
      .sort((a, b) => b.savedAt - a.savedAt || b.version - a.version)
      .slice(0, 100)
      .map((r) => ({
        id: r.id,
        version: r.version,
        title: r.title,
        savedAt: new Date(r.savedAt).toISOString(),
        author: userRef(data, r.authorId),
      }));
    return settle(list);
  },

  async getRevision(id, revisionId) {
    const data = load();
    accessible(data, id, currentUser(data).id);
    const r = data.revisions.find((x) => x.documentId === id && x.id === revisionId);
    if (!r) throw new ApiError(404, 'not_found', 'Version not found.');
    const revision: Revision = {
      id: r.id,
      version: r.version,
      title: r.title,
      savedAt: new Date(r.savedAt).toISOString(),
      author: userRef(data, r.authorId),
      content: r.content,
    };
    return settle(revision);
  },

  async restoreRevision(id, revisionId, baseVersion) {
    const revision = await api.getRevision(id, revisionId);
    const data = load();
    return updateDoc(data, id, currentUser(data), { title: revision.title, content: revision.content, baseVersion });
  },

  async listShares(id) {
    const data = load();
    accessible(data, id, currentUser(data).id);
    return settle(sharesOf(data, id));
  },

  async share(id, email, role) {
    const data = load();
    const me = currentUser(data);
    const { role: myRole } = accessible(data, id, me.id);
    requireOwner(myRole, 'Only the owner can change who has access.');

    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new ApiError(400, 'validation', 'email: Enter a valid email address.');
    }
    const target = data.users.find((u) => u.email.toLowerCase() === normalized);
    if (!target) throw new ApiError(404, 'user_not_found', `No account found for ${normalized}.`);
    if (target.id === me.id) throw new ApiError(400, 'bad_request', 'You already own this document.');

    const existing = data.shares.find((s) => s.documentId === id && s.userId === target.id);
    if (existing) existing.role = role;
    else data.shares.push({ documentId: id, userId: target.id, role, createdAt: Date.now() });
    save(data);
    return settle(sharesOf(data, id));
  },

  async revoke(id, userId) {
    const data = load();
    const { role } = accessible(data, id, currentUser(data).id);
    requireOwner(role, 'Only the owner can change who has access.');
    data.shares = data.shares.filter((s) => !(s.documentId === id && s.userId === userId));
    save(data);
    broadcast({ type: 'access-revoked', documentId: id, userId });
    return settle(sharesOf(data, id));
  },
};

// --- live channel between tabs ----------------------------------------------------------

type TabMessage =
  | { type: 'here'; documentId: string; tabId: string; user: { id: string; name: string } }
  | { type: 'bye'; documentId: string; tabId: string }
  | { type: 'saved'; document: LiveDocument }
  | { type: 'access-revoked'; documentId: string; userId: string }
  | { type: 'deleted'; documentId: string };

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('quire-demo') : null;
const listeners = new Set<(message: TabMessage) => void>();
channel?.addEventListener('message', (event) => listeners.forEach((fn) => fn(event.data as TabMessage)));

function broadcast(message: TabMessage) {
  channel?.postMessage(message);
}

const live = ({ id, title, content, version, updatedAt, updatedBy }: DocumentView): LiveDocument => ({
  id,
  title,
  content,
  version,
  updatedAt,
  updatedBy,
});

const HEARTBEAT_MS = 2000;
const STALE_MS = 6000;

/** Presence by heartbeat: each tab announces itself every 2 s and is dropped after 6 s of silence. */
export function openChannel(documentId: string, handlers: ChannelHandlers): () => void {
  const tabId = uuid();
  const others = new Map<string, { user: { id: string; name: string }; at: number }>();
  let me: User | null = null;
  try {
    me = currentUser(load());
  } catch {
    // signed out mid-way; presence just shows nobody
  }

  const emitPresence = () => {
    const now = Date.now();
    for (const [id, entry] of others) if (now - entry.at > STALE_MS) others.delete(id);
    const people = new Map<string, { id: string; name: string }>();
    if (me) people.set(me.id, { id: me.id, name: me.name });
    for (const { user } of others.values()) people.set(user.id, user);
    handlers.onPresence([...people.values()]);
  };

  const announce = () => {
    if (me) broadcast({ type: 'here', documentId, tabId, user: { id: me.id, name: me.name } });
  };

  const onMessage = (message: TabMessage) => {
    switch (message.type) {
      case 'here':
        if (message.documentId !== documentId || message.tabId === tabId) return;
        if (!others.has(message.tabId)) announce(); // say hello back so they see us at once
        others.set(message.tabId, { user: message.user, at: Date.now() });
        return emitPresence();
      case 'bye':
        if (message.documentId !== documentId) return;
        others.delete(message.tabId);
        return emitPresence();
      case 'saved':
        if (message.document.id === documentId) handlers.onSaved(message.document);
        return;
      case 'access-revoked':
        if (message.documentId === documentId && message.userId === me?.id) handlers.onGone('access-revoked');
        return;
      case 'deleted':
        if (message.documentId === documentId) handlers.onGone('deleted');
        return;
    }
  };

  listeners.add(onMessage);
  handlers.onConnection(channel !== null);
  announce();
  emitPresence();
  const beat = window.setInterval(() => {
    announce();
    emitPresence();
  }, HEARTBEAT_MS);
  const onUnload = () => broadcast({ type: 'bye', documentId, tabId });
  window.addEventListener('pagehide', onUnload);

  return () => {
    window.clearInterval(beat);
    window.removeEventListener('pagehide', onUnload);
    listeners.delete(onMessage);
    onUnload();
  };
}

// --- seed ------------------------------------------------------------------------------

/** Same accounts and documents as server/src/db.ts. */
function seed(): Data {
  const data: Data = { users: [], docs: [], shares: [], revisions: [] };
  const person = (email: string, name: string) => {
    const user = { id: uuid(), email, name, password: DEMO_PASSWORD };
    data.users.push(user);
    return user.id;
  };
  const alice = person('alice@ajaia.dev', 'Alice Moreno');
  const bob = person('bob@ajaia.dev', 'Bob Okafor');
  const carol = person('carol@ajaia.dev', 'Carol Singh');
  const share = (documentId: string, userId: string, role: ShareRole) =>
    data.shares.push({ documentId, userId, role, createdAt: Date.now() });

  const plan = createDoc(
    data,
    alice,
    'Q1 launch plan',
    `<h1>Q1 launch plan</h1><p>Shared with <strong>Bob</strong>, who can edit, and <strong>Carol</strong>, who can only view. Sign in as either of them in another tab to see how access differs.</p><h2>Goals</h2><ul><li><p>Ship the beta to two internal teams by the end of February</p></li><li><p>Collect <em>written</em> feedback before the March review</p></li><li><p>Keep the onboarding under ten minutes</p></li></ul><h2>Open questions</h2><ol><li><p>Who owns the onboarding docs?</p></li><li><p>Do we need SSO for the beta, or is email login enough?</p></li></ol><blockquote><p>Decide the launch date at the next planning sync.</p></blockquote>`,
  );
  share(plan.id, bob, 'editor');
  share(plan.id, carol, 'viewer');

  createDoc(
    data,
    alice,
    'Style notes',
    `<h1>Style notes</h1><p>A few rules for anything we publish internally.</p><h2>Voice</h2><ul><li><p>Plain words over clever ones</p></li><li><p>Sentence case for headings</p></li><li><p>Say what happens, not what the system does</p></li></ul><p>Private to Alice. Nobody else can see this one.</p>`,
  );
  createDoc(
    data,
    bob,
    'Interview notes',
    `<h1>Interview notes</h1><p>Private to Bob until he shares it. <u>Nobody else</u> can open this document.</p><h2>Candidate A</h2><p>Strong on systems design, asked good questions about how we deploy.</p>`,
  );
  const research = createDoc(
    data,
    carol,
    'Customer research digest',
    `<h1>Customer research digest</h1><p>Carol owns this one and has shared it with <strong>Alice</strong> as an editor.</p><h2>What we heard</h2><ol><li><p>People lose track of which version is the latest</p></li><li><p>Sharing by link feels risky for internal plans</p></li><li><p>Imports from Word need to keep headings</p></li></ol>`,
  );
  share(research.id, alice, 'editor');
  return data;
}

/** Wipes the demo's browser data and starts over from the seed. */
export function resetDemo() {
  local.set(DATA_KEY, null);
  session.set(SESSION_KEY, null);
}

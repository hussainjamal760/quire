import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { hashPassword } from './lib/passwords.js';

export type DB = Database.Database;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS document_shares (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (document_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS document_shares_user_idx ON document_shares(user_id);

  -- One row per editing session rather than per keystroke-save: consecutive
  -- saves by the same person within a few minutes update the same row.
  CREATE TABLE IF NOT EXISTS document_revisions (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    started_at  INTEGER NOT NULL,
    saved_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS document_revisions_doc_idx ON document_revisions(document_id, saved_at DESC);
`;

export const DEMO_PASSWORD = 'quire-demo';

export const DEMO_USERS = [
  { email: 'alice@ajaia.dev', name: 'Alice Moreno' },
  { email: 'bob@ajaia.dev', name: 'Bob Okafor' },
  { email: 'carol@ajaia.dev', name: 'Carol Singh' },
] as const;

export function openDatabase(file: string, { seed = true } = {}): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  if (seed) seedDemoData(db);
  return db;
}

/** Idempotent: only runs against an empty users table. */
function seedDemoData(db: DB) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (count > 0) return;

  const insertUser = db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)');
  const insertDoc = db.prepare(
    'INSERT INTO documents (id, owner_id, title, content, updated_by) VALUES (?, ?, ?, ?, ?)',
  );
  const insertShare = db.prepare('INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)');
  const insertRevision = db.prepare(
    `INSERT INTO document_revisions (id, document_id, version, title, content, author_id, started_at, saved_at)
     SELECT ?, id, version, title, content, owner_id, ?, ? FROM documents WHERE id = ?`,
  );

  db.transaction(() => {
    // One hash for all demo accounts; scrypt is deliberately slow.
    const passwordHash = hashPassword(DEMO_PASSWORD);
    const ids = DEMO_USERS.map((user) => {
      const id = randomUUID();
      insertUser.run(id, user.email, user.name, passwordHash);
      return id;
    });
    const [alice, bob, carol] = ids as [string, string, string];

    const seedDoc = (owner: string, title: string, content: string) => {
      const id = randomUUID();
      insertDoc.run(id, owner, title, compact(content), owner);
      insertRevision.run(randomUUID(), Date.now(), Date.now(), id);
      return id;
    };

    const plan = seedDoc(alice, 'Q1 launch plan', SEED_PLAN);
    insertShare.run(plan, bob, 'editor');
    insertShare.run(plan, carol, 'viewer');

    seedDoc(alice, 'Style notes', SEED_STYLE);
    seedDoc(bob, 'Interview notes', SEED_NOTES);

    const research = seedDoc(carol, 'Customer research digest', SEED_RESEARCH);
    insertShare.run(research, alice, 'editor');
  })();
}

/** Seed HTML is written readably below; strip the indentation between tags. */
const compact = (html: string) => html.replace(/>\s+</g, '><').trim();

const SEED_PLAN = `
  <h1>Q1 launch plan</h1>
  <p>Shared with <strong>Bob</strong>, who can edit, and <strong>Carol</strong>, who can only view.
  Sign in as either of them to see how access differs.</p>
  <h2>Goals</h2>
  <ul>
    <li><p>Ship the beta to two internal teams by the end of February</p></li>
    <li><p>Collect <em>written</em> feedback before the March review</p></li>
    <li><p>Keep the onboarding under ten minutes</p></li>
  </ul>
  <h2>Open questions</h2>
  <ol>
    <li><p>Who owns the onboarding docs?</p></li>
    <li><p>Do we need SSO for the beta, or is email login enough?</p></li>
  </ol>
  <blockquote><p>Decide the launch date at the next planning sync.</p></blockquote>
`;

const SEED_STYLE = `
  <h1>Style notes</h1>
  <p>A few rules for anything we publish internally.</p>
  <h2>Voice</h2>
  <ul>
    <li><p>Plain words over clever ones</p></li>
    <li><p>Sentence case for headings</p></li>
    <li><p>Say what happens, not what the system does</p></li>
  </ul>
  <p>Private to Alice. Nobody else can see this one.</p>
`;

const SEED_NOTES = `
  <h1>Interview notes</h1>
  <p>Private to Bob until he shares it. <u>Nobody else</u> can open this document.</p>
  <h2>Candidate A</h2>
  <p>Strong on systems design, asked good questions about how we deploy.</p>
`;

const SEED_RESEARCH = `
  <h1>Customer research digest</h1>
  <p>Carol owns this one and has shared it with <strong>Alice</strong> as an editor.</p>
  <h2>What we heard</h2>
  <ol>
    <li><p>People lose track of which version is the latest</p></li>
    <li><p>Sharing by link feels risky for internal plans</p></li>
    <li><p>Imports from Word need to keep headings</p></li>
  </ol>
`;

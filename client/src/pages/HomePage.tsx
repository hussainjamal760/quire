import { useEffect, useState, type CSSProperties } from 'react';
import { api, type DocumentListItem, type User } from '../api';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { ImportDrop } from '../components/ImportDrop';
import { useToast } from '../components/Toast';
import { Wordmark } from '../components/Wordmark';
import { listCache } from '../lib/cache';
import { formatUpdated, roleLabel } from '../lib/format';
import { openDocument } from '../lib/open';
import { firstName, personStyle } from '../lib/people';
import { docHref } from '../lib/router';

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  // Start from the last list we saw so going back from a document is instant.
  const [lists, setLists] = useState(listCache.value);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const notify = useToast();

  useEffect(() => {
    api.listDocuments().then(
      (fresh) => {
        listCache.value = fresh;
        setLists(fresh);
      },
      (err: Error) => setLoadError(err.message),
    );
  }, []);

  async function createDocument() {
    setCreating(true);
    try {
      const doc = await api.createDocument();
      await openDocument(doc.id, doc);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create a document.', { tone: 'error' });
      setCreating(false);
    }
  }

  const sharedCount = lists?.shared.length ?? 0;

  return (
    <div className="home">
      <header className="home-bar">
        <Wordmark />
        <div className="home-user">
          <Avatar name={user.name} />
          <span className="home-user-name">{user.name}</span>
          <button className="button button-quiet" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="home-main">
        <div className="home-intro">
          <h1>
            {greeting()}, {firstName(user.name)}.
          </h1>
          <p>
            {lists
              ? sharedCount > 0
                ? `${sharedCount} ${sharedCount === 1 ? 'document is' : 'documents are'} shared with you.`
                : 'Nothing is shared with you yet.'
              : ' '}
          </p>
        </div>

        <div className="home-actions">
          <button className="new-tile" onClick={createDocument} disabled={creating}>
            <span className="new-sheet" aria-hidden="true">
              <Icon name="plus" size={22} />
            </span>
            <span>
              <strong>{creating ? 'Creating…' : 'New document'}</strong>
              <span>Start from a blank page</span>
            </span>
          </button>
          <ImportDrop
            onImported={(doc) => {
              notify(`Imported “${doc.title}”`);
              void openDocument(doc.id, doc);
            }}
            onError={(message) => notify(message, { tone: 'error' })}
          />
        </div>

        {loadError && (
          <p className="form-error" role="alert">
            {loadError}
          </p>
        )}

        {lists && (
          <>
            <Shelf
              heading="Your documents"
              documents={lists.owned}
              empty="Your documents will live here. Start a new one or drop in a file."
            />
            <Shelf
              heading="Shared with you"
              documents={lists.shared}
              empty="When someone shares a document with you, it lands here."
              shared
            />
          </>
        )}
      </main>
    </div>
  );
}

function Shelf({
  heading,
  documents,
  empty,
  shared = false,
}: {
  heading: string;
  documents: DocumentListItem[];
  empty: string;
  shared?: boolean;
}) {
  return (
    <section className="shelf" aria-label={heading}>
      <h2>
        {heading}
        <span className="shelf-count">{documents.length}</span>
      </h2>
      {documents.length === 0 ? (
        <p className="shelf-empty">{empty}</p>
      ) : (
        <ul className="shelf-grid">
          {documents.map((doc) => (
            <li key={doc.id}>
              <DocCard doc={doc} shared={shared} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocCard({ doc, shared }: { doc: DocumentListItem; shared: boolean }) {
  return (
    <a
      className="card"
      href={docHref(doc.id)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let the browser open a new tab
        e.preventDefault();
        void openDocument(doc.id);
      }}
    >
      <div className="card-sheet" style={{ viewTransitionName: `sheet-${doc.id}` } as CSSProperties}>
        {/* Server-sanitized HTML: the same allowlist every save goes through. */}
        <div className="card-preview prose" dangerouslySetInnerHTML={{ __html: doc.preview || '<p></p>' }} />
        {shared && (
          <span className={`card-tab role-${doc.role}`} style={personStyle(doc.owner.name)}>
            {roleLabel[doc.role]}
          </span>
        )}
      </div>
      <div className="card-meta">
        <span className="card-title">{doc.title}</span>
        <span className="card-sub">
          {shared ? (
            <>
              <Avatar name={doc.owner.name} size="sm" />
              {firstName(doc.owner.name)}, {formatUpdated(doc.updatedAt)}
            </>
          ) : (
            `Edited ${formatUpdated(doc.updatedAt)}`
          )}
        </span>
      </div>
    </a>
  );
}

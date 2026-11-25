import { useEffect, useState } from 'react';
import { api, type Revision, type RevisionSummary } from '../api';
import { firstName, personStyle } from '../lib/people';
import { Icon } from './Icon';

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return day.format(date);
}

function groupByDay(revisions: RevisionSummary[]) {
  const groups: Array<{ label: string; items: RevisionSummary[] }> = [];
  for (const revision of revisions) {
    const label = dayLabel(revision.savedAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(revision);
    else groups.push({ label, items: [revision] });
  }
  return groups;
}

/**
 * Version history. Picking an entry previews it on the page; the newest entry
 * is the current document, so it can't be "restored".
 */
export function HistoryDrawer({
  documentId,
  refreshKey,
  selectedId,
  onSelect,
  onClose,
}: {
  documentId: string;
  /** Changes whenever the document is saved, so the list stays current. */
  refreshKey: number;
  selectedId: string | null;
  onSelect: (revision: Revision | null, isCurrent: boolean) => void;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    api.listRevisions(documentId).then(setRevisions, (err: Error) => setError(err.message));
  }, [documentId, refreshKey]);

  async function select(summary: RevisionSummary, isCurrent: boolean) {
    if (isCurrent) return onSelect(null, true);
    setLoadingId(summary.id);
    try {
      onSelect(await api.getRevision(documentId, summary.id), false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that version.');
    } finally {
      setLoadingId(null);
    }
  }

  const currentId = revisions?.[0]?.id;

  return (
    <aside className="drawer" aria-label="Version history">
      <div className="drawer-head">
        <h2>History</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close history">
          <Icon name="close" />
        </button>
      </div>
      <p className="drawer-note">Saves by the same person within five minutes are grouped into one version.</p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {revisions &&
        groupByDay(revisions).map((group) => (
          <section key={group.label} className="drawer-group">
            <h3>{group.label}</h3>
            <ol>
              {group.items.map((revision) => {
                const isCurrent = revision.id === currentId;
                const selected = isCurrent ? selectedId === null : selectedId === revision.id;
                const author = revision.author?.name ?? 'Someone';
                return (
                  <li key={revision.id}>
                    <button
                      className={`version${selected ? ' is-selected' : ''}`}
                      style={personStyle(author)}
                      onClick={() => select(revision, isCurrent)}
                      aria-current={selected ? 'true' : undefined}
                    >
                      <span className="version-time">{time.format(new Date(revision.savedAt))}</span>
                      <span className="version-who">
                        {firstName(author)}
                        {isCurrent && <span className="version-current">Current</span>}
                      </span>
                      {loadingId === revision.id && <span className="version-loading">Loading…</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
    </aside>
  );
}

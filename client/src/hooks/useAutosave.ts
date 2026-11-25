import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type DocumentView, type LiveDocument } from '../api';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

type Changes = { title?: string; content?: string };

const DEBOUNCE_MS = 700;

/**
 * Debounced, serialized saves for one document.
 *
 * - Edits are merged while waiting, so a burst of typing becomes one PATCH.
 * - Only one request is in flight; anything typed meanwhile goes out right after.
 * - Every PATCH carries the version we last saw. A 409 means someone else saved
 *   first, and we stop and let the user choose rather than clobbering their edit.
 * - Leaving the page flushes with `keepalive`, so the last edit survives a closed tab.
 */
export function useAutosave(doc: DocumentView, onSaved: (doc: DocumentView) => void) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<DocumentView | null>(null);

  const version = useRef(doc.version);
  const pending = useRef<Changes>({});
  const inFlight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const blocked = useRef(false); // true while a conflict is unresolved
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const hasPending = () => pending.current.title !== undefined || pending.current.content !== undefined;

  const flush = useCallback(
    async ({ keepalive = false } = {}) => {
      window.clearTimeout(timer.current);
      if (inFlight.current || blocked.current || !hasPending()) return;

      const changes = pending.current;
      pending.current = {};
      inFlight.current = true;
      setStatus('saving');

      try {
        const saved = await api.updateDocument(doc.id, { ...changes, baseVersion: version.current }, { keepalive });
        version.current = saved.version;
        setError(null);
        onSavedRef.current(saved);
      } catch (err) {
        // Put the unsent changes back, without overwriting anything newer.
        pending.current = { ...changes, ...pending.current };

        if (err instanceof ApiError && err.code === 'version_conflict') {
          blocked.current = true;
          setConflict((err.details as { latest: DocumentView }).latest);
          setStatus('conflict');
        } else {
          setError(err instanceof Error ? err.message : 'Could not save.');
          setStatus('error');
        }
        return;
      } finally {
        inFlight.current = false;
      }

      if (hasPending()) void flush();
      else setStatus('saved');
    },
    [doc.id],
  );

  const queue = useCallback(
    (changes: Changes) => {
      pending.current = { ...pending.current, ...changes };
      if (blocked.current) return;
      setStatus((s) => (s === 'saving' ? s : 'pending'));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  /**
   * Someone else saved. If we have nothing unsaved, take their copy as our new
   * base and report true so the caller can show it. Otherwise leave it alone:
   * our next save will get a 409 and the user decides.
   */
  const adopt = useCallback((latest: LiveDocument): boolean => {
    if (latest.version <= version.current) return false; // our own save echoing back
    if (inFlight.current || hasPending() || blocked.current) return false;
    version.current = latest.version;
    return true;
  }, []);

  /** Keep my version: re-apply my pending edits on top of the latest copy. */
  const overwrite = useCallback(() => {
    if (!conflict) return;
    version.current = conflict.version;
    blocked.current = false;
    setConflict(null);
    void flush();
  }, [conflict, flush]);

  /** Take theirs: drop local edits and adopt the latest copy. */
  const discard = useCallback(() => {
    if (!conflict) return null;
    const latest = conflict;
    version.current = latest.version;
    pending.current = {};
    blocked.current = false;
    setConflict(null);
    setStatus('saved');
    return latest;
  }, [conflict]);

  /** After a restore from history, the server copy is the new base. */
  const reset = useCallback((latest: DocumentView) => {
    window.clearTimeout(timer.current);
    version.current = latest.version;
    pending.current = {};
    blocked.current = false;
    setConflict(null);
    setStatus('saved');
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPending() && !inFlight.current) return;
      void flush({ keepalive: true });
      event.preventDefault();
    };
    // pagehide also fires on mobile when the tab is backgrounded and killed
    const pageHide = () => void flush({ keepalive: true });
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', pageHide);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', pageHide);
      void flush({ keepalive: true }); // leaving the document inside the app
    };
  }, [flush]);

  const retry = useCallback(() => void flush(), [flush]);
  const hasUnsaved = useCallback(() => hasPending() || inFlight.current, []);

  return { status, error, conflict, queue, adopt, reset, retry, overwrite, discard, hasUnsaved };
}

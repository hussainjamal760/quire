import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { api, ApiError, type DocumentView, type Revision, type User } from '../api';
import { DocMenu, type MenuItem } from '../components/DocMenu';
import { HistoryDrawer } from '../components/HistoryDrawer';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Presence } from '../components/Presence';
import { ShareDialog } from '../components/ShareDialog';
import { useToast } from '../components/Toast';
import { Toolbar } from '../components/Toolbar';
import { Wordmark } from '../components/Wordmark';
import { useAutosave, type SaveStatus } from '../hooks/useAutosave';
import { useDocumentChannel } from '../hooks/useDocumentChannel';
import { documentCache, listCache } from '../lib/cache';
import { downloadText, safeFilename, toMarkdown } from '../lib/exporters';
import { formatUpdated } from '../lib/format';
import { firstName } from '../lib/people';
import { navigate } from '../lib/router';

export function EditorPage({ id, user }: { id: string; user: User }) {
  // Usually already fetched by openDocument(), so the first frame is the real page.
  const [doc, setDoc] = useState<DocumentView | null>(() => documentCache.get(id) ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    documentCache.delete(id);
    if (doc) return;
    api.getDocument(id).then(setDoc, (err: unknown) => {
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? 'This document doesn’t exist, or it hasn’t been shared with you.'
          : err instanceof Error
            ? err.message
            : 'Could not open the document.',
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per id
  }, [id]);

  if (loadError) {
    return (
      <main className="editor-missing">
        <Wordmark />
        <p>{loadError}</p>
        <button className="button button-ink" onClick={() => navigate('/')}>
          Back to your documents
        </button>
      </main>
    );
  }
  if (!doc) return <main className="editor-loading">Opening document…</main>;

  return <DocumentEditor initial={doc} user={user} />;
}

const statusText: Record<SaveStatus, string> = {
  saved: 'Saved',
  pending: 'Editing',
  saving: 'Saving',
  error: 'Not saved',
  conflict: 'Not saved',
};

/** How long someone counts as "editing" after their last save arrives. */
const ACTIVE_MS = 4000;

function setContentKeepingSelection(editor: Editor, html: string) {
  const { from, to } = editor.state.selection;
  // emitUpdate: false, otherwise showing someone else's copy would queue a save of it
  editor.commands.setContent(html, { emitUpdate: false });
  const max = editor.state.doc.content.size;
  editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
}

function DocumentEditor({ initial, user }: { initial: DocumentView; user: User }) {
  const [doc, setDoc] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [sharing, setSharing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<Revision | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const notify = useToast();
  const conflictRef = useRef<HTMLDivElement>(null);

  const canEdit = doc.role !== 'viewer';
  const isOwner = doc.role === 'owner';

  const onSaved = useCallback((saved: DocumentView) => {
    setDoc(saved);
    setHistoryKey((k) => k + 1);
  }, []);
  const save = useAutosave(initial, onSaved);

  // A conflict needs a decision. If the user is scrolled down the page, bring the choice into view.
  useEffect(() => {
    if (save.conflict) conflictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [save.conflict]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({ placeholder: 'Start writing, or type # for a heading…' }),
    ],
    content: initial.content,
    editable: canEdit,
    editorProps: { attributes: { class: 'prose', 'aria-label': 'Document body' } },
    onUpdate: ({ editor }) => save.queue({ content: editor.getHTML() }),
  });

  // --- Live updates from other people -------------------------------------
  const lastToast = useRef(new Map<string, number>());
  const activeTimers = useRef(new Map<string, number>());

  const markActive = useCallback((personId: string) => {
    setActiveIds((ids) => new Set(ids).add(personId));
    window.clearTimeout(activeTimers.current.get(personId));
    activeTimers.current.set(
      personId,
      window.setTimeout(() => {
        setActiveIds((ids) => {
          const next = new Set(ids);
          next.delete(personId);
          return next;
        });
      }, ACTIVE_MS),
    );
  }, []);

  const { present } = useDocumentChannel(doc.id, {
    onSaved: (remote) => {
      const author = remote.updatedBy;
      if (author && author.id !== user.id) markActive(author.id);
      if (!save.adopt(remote)) return;

      setDoc((current) => ({ ...current, ...remote })); // keep our own role and owner
      setTitle(remote.title);
      setHistoryKey((k) => k + 1);
      if (editor && editor.getHTML() !== remote.content) setContentKeepingSelection(editor, remote.content);

      // One toast per person per half minute; the pulsing avatar covers the rest.
      if (author && author.id !== user.id) {
        const last = lastToast.current.get(author.id) ?? 0;
        if (Date.now() - last > 30_000) {
          lastToast.current.set(author.id, Date.now());
          notify(`${firstName(author.name)} is editing. Changes appear as they save.`, { person: author.name });
        }
      }
    },
    onGone: (reason) => {
      listCache.value = null;
      notify(reason === 'deleted' ? 'This document was deleted.' : 'Your access to this document was removed.', {
        tone: 'error',
      });
      navigate('/');
    },
  });

  useEffect(() => () => activeTimers.current.forEach((t) => window.clearTimeout(t)), []);

  // ⌘S / Ctrl+S: saves already happen on their own, but people press it out of habit.
  const { retry } = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        retry();
        notify(canEdit ? 'Quire saves as you type.' : 'You have view-only access.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [retry, notify, canEdit]);

  // --- Actions --------------------------------------------------------------
  function takeLatest() {
    const latest = save.discard();
    if (!latest) return;
    setDoc(latest);
    setTitle(latest.title);
    editor?.commands.setContent(latest.content, { emitUpdate: false });
  }

  async function restore(revision: Revision) {
    if (save.hasUnsaved()) {
      save.retry();
      notify('Saving your latest changes first. Try again in a moment.');
      return;
    }
    setRestoring(true);
    try {
      const restored = await api.restoreRevision(doc.id, revision.id, doc.version);
      save.reset(restored);
      setDoc(restored);
      setTitle(restored.title);
      editor?.commands.setContent(restored.content, { emitUpdate: false });
      setPreview(null);
      setHistoryKey((k) => k + 1);
      notify('Version restored. The one it replaced is still in history.');
    } catch (err) {
      notify(
        err instanceof ApiError && err.code === 'version_conflict'
          ? 'Someone saved just now. Check the latest version and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not restore that version.',
        { tone: 'error' },
      );
    } finally {
      setRestoring(false);
    }
  }

  async function deleteDocument() {
    try {
      await api.deleteDocument(doc.id);
      listCache.value = null;
      notify(`Deleted “${title || 'Untitled document'}”.`);
      navigate('/', { transition: false });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the document.', { tone: 'error' });
    }
  }

  const markdown = () => toMarkdown(title || 'Untitled document', preview?.content ?? editor?.getHTML() ?? doc.content);

  // The hosted demo runs in a sandboxed frame that refuses downloads and printing,
  // so it offers a copy instead.
  const exportItems: MenuItem[] = import.meta.env.VITE_DEMO
    ? [
        {
          label: 'Copy as Markdown',
          icon: 'download',
          onSelect: () =>
            navigator.clipboard.writeText(markdown()).then(
              () => notify('Markdown copied to the clipboard.'),
              () => notify('Your browser blocked the clipboard here.', { tone: 'error' }),
            ),
        },
      ]
    : [
        {
          label: 'Download as Markdown',
          icon: 'download',
          onSelect: () => downloadText(safeFilename(title || 'Untitled document', 'md'), markdown()),
        },
        { label: 'Print or save as PDF', icon: 'print', onSelect: () => window.print() },
      ];

  const menu: MenuItem[] = [
    ...exportItems,
    ...(isOwner
      ? [{ label: 'Delete document', icon: 'trash' as const, danger: true, onSelect: () => setConfirmingDelete(true) }]
      : []),
  ];

  const sheetStyle = { viewTransitionName: `sheet-${doc.id}` } as CSSProperties;
  const lastEditor = doc.updatedBy && doc.updatedBy.id !== user.id ? firstName(doc.updatedBy.name) : null;

  return (
    <div className={`editor${historyOpen ? ' has-drawer' : ''}`}>
      <header className="editor-bar">
        <button className="icon-button" onClick={() => navigate('/')} aria-label="Back to your documents">
          <Icon name="back" />
        </button>
        <a
          href="/"
          className="editor-brand"
          aria-label="Quire home"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <Wordmark compact />
        </a>

        <div className="editor-title">
          <input
            aria-label="Document title"
            value={title}
            maxLength={200}
            readOnly={!canEdit}
            placeholder="Untitled document"
            onChange={(e) => {
              setTitle(e.target.value);
              save.queue({ title: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') editor?.commands.focus('start');
            }}
          />
          <span className="editor-sub">
            {canEdit ? (
              <span className={`save save-${save.status}`} role="status" aria-live="polite">
                <span className="save-dot" aria-hidden="true" />
                {statusText[save.status]}
                {save.status === 'error' && (
                  <>
                    {' '}
                    <button className="link-button" onClick={save.retry}>
                      Try again
                    </button>
                  </>
                )}
              </span>
            ) : (
              <span className="save">
                <Icon name="eye" size={14} /> View only
              </span>
            )}
            <span className="editor-edited">
              {lastEditor
                ? `${lastEditor} edited ${formatUpdated(doc.updatedAt)}`
                : `Edited ${formatUpdated(doc.updatedAt)}`}
            </span>
          </span>
        </div>

        <div className="editor-actions">
          <Presence present={present} me={user} activeIds={activeIds} />
          <button
            className={`icon-button${historyOpen ? ' is-on' : ''}`}
            aria-label="Version history"
            aria-pressed={historyOpen}
            onClick={() => {
              setHistoryOpen((v) => !v);
              setPreview(null);
            }}
          >
            <Icon name="history" />
          </button>
          <DocMenu items={menu} />
          {isOwner && (
            <button className="button button-ink" onClick={() => setSharing(true)}>
              <Icon name="share" size={16} />
              Share
            </button>
          )}
        </div>
      </header>

      {!isOwner && !preview && (
        <p className={`notice notice-${doc.role}`}>
          {doc.role === 'viewer'
            ? `${firstName(doc.owner.name)} shared this with you as view-only. You’ll see their changes as they’re made.`
            : `${firstName(doc.owner.name)} shared this with you. Your edits save to their document.`}
        </p>
      )}

      {save.error && save.status === 'error' && (
        <p className="notice notice-error" role="alert">
          {save.error}
        </p>
      )}

      {save.conflict && (
        <div className="notice notice-conflict" role="alert" ref={conflictRef}>
          <p>
            <strong>{save.conflict.updatedBy ? firstName(save.conflict.updatedBy.name) : 'Someone'}</strong> saved a
            newer version while you were typing. Your latest changes aren’t saved yet.
          </p>
          <div className="notice-actions">
            <button className="button" onClick={takeLatest}>
              Use their version
            </button>
            <button className="button button-ink" onClick={save.overwrite}>
              Keep mine
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div className="notice notice-preview">
          <p>
            Viewing {preview.author ? `${firstName(preview.author.name)}’s` : 'a'} version from{' '}
            {new Date(preview.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            {preview.title !== title && <>, when it was called “{preview.title}”</>}.
          </p>
          <div className="notice-actions">
            <button className="button" onClick={() => setPreview(null)}>
              Back to current
            </button>
            {canEdit && (
              <button className="button button-ink" onClick={() => restore(preview)} disabled={restoring}>
                {restoring ? 'Restoring…' : 'Restore this version'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="stage">
        {canEdit && editor && !preview && <Toolbar editor={editor} />}

        <article className={`page${preview ? ' is-preview' : ''}`} style={sheetStyle}>
          {preview ? (
            // Revision HTML went through the same server-side sanitizer as every save.
            <div className="prose" dangerouslySetInnerHTML={{ __html: preview.content }} />
          ) : (
            <EditorContent editor={editor} />
          )}
        </article>
      </div>

      {historyOpen && (
        <HistoryDrawer
          documentId={doc.id}
          refreshKey={historyKey}
          selectedId={preview?.id ?? null}
          onSelect={(revision) => setPreview(revision)}
          onClose={() => {
            setHistoryOpen(false);
            setPreview(null);
          }}
        />
      )}

      {sharing && (
        <ShareDialog
          documentId={doc.id}
          documentTitle={title || 'Untitled document'}
          ownerName={user.name}
          onClose={() => setSharing(false)}
        />
      )}

      {confirmingDelete && (
        <Modal title="Delete this document?" onClose={() => setConfirmingDelete(false)} className="confirm">
          {(close) => (
            <>
              <p className="confirm-text">
                “{title || 'Untitled document'}” and its history will be deleted for you and everyone it’s shared with.
                This can’t be undone.
              </p>
              <div className="modal-footer">
                <button className="button" onClick={close}>
                  Keep it
                </button>
                <button className="button button-danger" onClick={deleteDocument}>
                  Delete document
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

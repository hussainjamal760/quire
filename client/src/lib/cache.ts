import type { DocumentListItem, DocumentView } from '../api';

/**
 * Tiny in-memory caches so navigation can render the next screen immediately.
 * That matters for the view transition: the browser snapshots the new screen
 * right away, so it has to be the real page, not a loading state.
 */
export const documentCache = new Map<string, DocumentView>();

export const listCache: { value: { owned: DocumentListItem[]; shared: DocumentListItem[] } | null } = {
  value: null,
};

let editorChunk: Promise<unknown> | null = null;
export const loadEditorChunk = () => (editorChunk ??= import('../pages/EditorPage'));

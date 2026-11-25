import { api, type DocumentView } from '../api';
import { documentCache, loadEditorChunk } from './cache';
import { navigate } from './router';

/**
 * Fetches the document and the editor code first, then navigates, so the
 * editor renders on the first frame and the view transition morphs straight
 * into the real page. Falls back to a plain navigation if the fetch fails;
 * the editor page then shows the error.
 */
export async function openDocument(id: string, known?: DocumentView) {
  try {
    const [doc] = await Promise.all([known ?? api.getDocument(id), loadEditorChunk()]);
    documentCache.set(id, doc);
  } catch {
    // handled by the editor page
  }
  navigate(`/d/${id}`);
}

import { useEffect, useRef, useState } from 'react';
import { api, type DocumentView } from '../api';
import { Icon } from './Icon';

export const ACCEPTED = ['.txt', '.md', '.markdown', '.docx'];
const MAX_BYTES = 2 * 1024 * 1024;

function problemWith(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED.includes(ext)) return `${file.name} isn’t a .txt, .md or .docx file.`;
  if (file.size > MAX_BYTES) return `${file.name} is larger than 2 MB.`;
  return null;
}

/**
 * Import by clicking or by dropping a file anywhere on the page. The server
 * validates again; checking here just avoids a pointless upload.
 */
export function ImportDrop({
  onImported,
  onError,
}: {
  onImported: (doc: DocumentView) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    const problem = problemWith(file);
    if (problem) return onError(problem);

    setBusy(true);
    try {
      onImported(await api.importFile(file));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  // Page-wide drop target. A depth counter avoids flicker as the drag crosses child elements.
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void uploadRef.current(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <>
      <button className="import-tile" onClick={() => input.current?.click()} disabled={busy}>
        <span className="import-icon">
          <Icon name="upload" />
        </span>
        <span className="import-text">
          <strong>{busy ? 'Importing…' : 'Import a file'}</strong>
          <span>Drop or choose a .txt, .md or .docx, up to 2 MB</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(',')}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className={`drop-overlay${dragging ? ' is-active' : ''}`} aria-hidden="true">
        <div className="drop-sheet">
          <Icon name="upload" size={28} />
          <p>Drop to turn it into a document</p>
          <span>.txt, .md or .docx, up to 2 MB</span>
        </div>
      </div>
    </>
  );
}

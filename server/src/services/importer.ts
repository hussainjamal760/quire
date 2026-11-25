import path from 'node:path';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { badRequest } from '../lib/errors.js';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'] as const;

export interface ImportedFile {
  title: string;
  html: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Blank lines separate paragraphs; single newlines stay inside the paragraph as <br>. */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function titleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, ' ').trim();
  return base.slice(0, 200) || 'Imported document';
}

/**
 * Converts an uploaded file into document HTML. The result is not sanitized
 * here — DocumentService does that on every write, imports included.
 */
export async function importFile(filename: string, buffer: Buffer): Promise<ImportedFile> {
  const extension = path.extname(filename).toLowerCase();
  const title = titleFromFilename(filename);

  switch (extension) {
    case '.txt':
      return { title, html: plainTextToHtml(buffer.toString('utf8')) };

    case '.md':
    case '.markdown':
      return { title, html: await marked.parse(buffer.toString('utf8'), { gfm: true }) };

    case '.docx': {
      try {
        const { value } = await mammoth.convertToHtml({ buffer });
        return { title, html: value };
      } catch {
        throw badRequest('That .docx file could not be read. It may be corrupted or password-protected.');
      }
    }

    default:
      throw badRequest(`Unsupported file type. Upload one of: ${SUPPORTED_EXTENSIONS.join(', ')}.`);
  }
}

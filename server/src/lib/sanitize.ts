import sanitizeHtml from 'sanitize-html';

/**
 * Document HTML is stored as-is and rendered by the editor, so everything that
 * reaches the database goes through this allowlist first. It mirrors what the
 * TipTap schema on the client can represent; anything else would be dropped by
 * the editor on load anyway.
 */
const options: sanitizeHtml.IOptions = {
  allowedTags: [
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
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    ol: ['start'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    b: 'strong',
    i: 'em',
    strike: 's',
    del: 's',
    h4: 'h3',
    h5: 'h3',
    h6: 'h3',
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, options).trim();
}

const BLOCK_END = /<\/(?:p|h[1-3]|ul|ol|blockquote|pre)>/g;

/**
 * The first ~600 characters of a document, cut at a block boundary, for the
 * thumbnails on the home screen. Re-sanitizing closes any tag the cut left open.
 */
export function previewHtml(html: string, budget = 600): string {
  if (html.length <= budget) return html;

  let cut = 0;
  for (const match of html.matchAll(BLOCK_END)) {
    const end = match.index + match[0].length;
    if (end > budget && cut > 0) break;
    cut = end;
  }
  return sanitizeDocumentHtml(html.slice(0, cut || budget));
}

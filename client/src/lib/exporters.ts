import TurndownService from 'turndown';

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
// Markdown has no underline. Keep the text, lose the mark.
turndown.addRule('underline', { filter: ['u'], replacement: (content) => content });
turndown.addRule('strike', { filter: ['s', 'del'], replacement: (content) => `~~${content}~~` });

export function toMarkdown(title: string, html: string): string {
  const body = turndown.turndown(html).trim();
  // Most documents start with their own title as a heading; don't repeat it.
  const startsWithTitle = body.toLowerCase().startsWith(`# ${title.toLowerCase()}`);
  return `${startsWithTitle ? '' : `# ${title}\n\n`}${body}\n`;
}

export function downloadText(filename: string, text: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title: string, extension: string) {
  const base =
    title
      .replace(/[\\/:*?"<>|]+/g, '')
      .trim()
      .slice(0, 80) || 'document';
  return `${base}.${extension}`;
}

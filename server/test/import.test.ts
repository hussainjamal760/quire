import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { plainTextToHtml } from '../src/services/importer.js';
import { makeTestApp } from './helpers.js';

describe('plainTextToHtml', () => {
  it('turns blank-line blocks into paragraphs and escapes markup', () => {
    expect(plainTextToHtml('Hello\nworld\n\n<b>not bold</b>\r\n\r\n\n')).toBe(
      '<p>Hello<br>world</p><p>&lt;b&gt;not bold&lt;/b&gt;</p>',
    );
  });
});

describe('POST /api/documents/import', () => {
  it('creates an editable document from markdown, named after the file', async () => {
    const { signIn } = makeTestApp();
    const alice = await signIn('alice@ajaia.dev');

    const md = '# Release notes\n\n- **Faster** saves\n- Sharing\n\n<script>alert(1)</script>';
    const res = await alice
      .post('/api/documents/import')
      .attach('file', Buffer.from(md), 'release_notes.md')
      .expect(201);

    expect(res.body.title).toBe('release notes');
    expect(res.body.role).toBe('owner');
    expect(res.body.content).toContain('<h1>Release notes</h1>');
    expect(res.body.content).toContain('<strong>Faster</strong>');
    expect(res.body.content).not.toContain('script');
  });

  it('keeps headings, bold and lists from a .docx', async () => {
    const { signIn } = makeTestApp();
    const alice = await signIn('alice@ajaia.dev');

    const fixture = fs.readFileSync(new URL('./fixtures/minutes.docx', import.meta.url));
    const res = await alice.post('/api/documents/import').attach('file', fixture, 'minutes.docx').expect(201);

    expect(res.body.title).toBe('minutes');
    expect(res.body.content).toContain('<h1>Meeting minutes</h1>');
    expect(res.body.content).toContain('<strong>final</strong>');
    expect(res.body.content).toMatch(/<ul><li>Ship beta<\/li><\/ul>/);
  });

  it('rejects unsupported and empty files', async () => {
    const { signIn } = makeTestApp();
    const alice = await signIn('alice@ajaia.dev');

    const pdf = await alice.post('/api/documents/import').attach('file', Buffer.from('%PDF'), 'deck.pdf').expect(400);
    expect(pdf.body.error.message).toMatch(/\.txt, \.md/);

    await alice.post('/api/documents/import').attach('file', Buffer.from('   \n\n '), 'blank.txt').expect(400);
    await alice.post('/api/documents/import').expect(400);
  });

  it('rejects files over the size limit', async () => {
    const { signIn } = makeTestApp();
    const alice = await signIn('alice@ajaia.dev');

    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 'a');
    const res = await alice.post('/api/documents/import').attach('file', big, 'big.txt').expect(400);
    expect(res.body.error.message).toMatch(/2 MB/);
  });
});

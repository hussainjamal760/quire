import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import type { AuthService } from '../services/auth.js';
import type { DocumentService } from '../services/documents.js';
import type { DocumentHub } from '../services/hub.js';
import { importFile, SUPPORTED_EXTENSIONS } from '../services/importer.js';
import { badRequest, HttpError, notFound } from '../lib/errors.js';
import { currentUser, requireUser } from './auth.js';

const MAX_TITLE = 200;
// Generous for a text document; keeps a runaway paste from bloating the DB.
const MAX_CONTENT = 500_000;

const createSchema = z.object({
  title: z.string().max(MAX_TITLE).optional(),
  content: z.string().max(MAX_CONTENT).optional(),
});

const updateSchema = z.object({
  title: z.string().max(MAX_TITLE, `Title must be ${MAX_TITLE} characters or fewer.`).optional(),
  content: z.string().max(MAX_CONTENT, 'Document is too large to save.').optional(),
  baseVersion: z.number().int().positive(),
});

const shareSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: z.enum(['viewer', 'editor']),
});

const uuid = z.string().uuid();

/** Malformed ids get the same 404 as ids that don't exist. */
function parseId(value: unknown, what = 'Document') {
  const result = uuid.safeParse(value);
  if (!result.success) throw notFound(`${what} not found.`);
  return result.data;
}

const restoreSchema = z.object({ baseVersion: z.number().int().positive() });

export function documentsRouter(
  documents: DocumentService,
  auth: AuthService,
  hub: DocumentHub,
  { maxUploadBytes }: { maxUploadBytes: number },
) {
  const router = Router();
  router.use(requireUser);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 1 },
    fileFilter: (_req, file, accept) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) return accept(null, true);
      accept(badRequest(`Unsupported file type. Upload one of: ${SUPPORTED_EXTENSIONS.join(', ')}.`));
    },
  });

  router.get('/', (req, res) => {
    res.json(documents.listFor(currentUser(req).id));
  });

  router.post('/', (req, res) => {
    const input = createSchema.parse(req.body ?? {});
    res.status(201).json(documents.create(currentUser(req).id, input));
  });

  router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Choose a file to import.');

    const imported = await importFile(req.file.originalname, req.file.buffer);
    if (!imported.html.trim()) throw badRequest('That file has no text to import.');

    res.status(201).json(documents.create(currentUser(req).id, { title: imported.title, content: imported.html }));
  });

  router.get('/:id', (req, res) => {
    res.json(documents.get(parseId(req.params.id), currentUser(req).id));
  });

  router.patch('/:id', (req, res) => {
    const changes = updateSchema.parse(req.body);
    const saved = documents.update(parseId(req.params.id), currentUser(req).id, changes);
    hub.publishSave(saved);
    res.json(saved);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    documents.delete(id, currentUser(req).id);
    hub.closeRoom(id);
    res.status(204).end();
  });

  // Live channel: presence plus every save, as server-sent events.
  router.get('/:id/events', (req, res) => {
    const id = parseId(req.params.id);
    const user = currentUser(req);
    documents.get(id, user.id); // 404 before we commit to a stream

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // stop nginx-style proxies from buffering the stream
    });
    res.write('retry: 3000\n\n');

    const leave = hub.join(id, user, res);
    req.on('close', leave);
  });

  router.get('/:id/revisions', (req, res) => {
    res.json({ revisions: documents.listRevisions(parseId(req.params.id), currentUser(req).id) });
  });

  router.get('/:id/revisions/:revisionId', (req, res) => {
    const revisionId = parseId(req.params.revisionId, 'Version');
    res.json(documents.getRevision(parseId(req.params.id), revisionId, currentUser(req).id));
  });

  router.post('/:id/revisions/:revisionId/restore', (req, res) => {
    const { baseVersion } = restoreSchema.parse(req.body);
    const revisionId = parseId(req.params.revisionId, 'Version');
    const saved = documents.restoreRevision(parseId(req.params.id), revisionId, currentUser(req).id, baseVersion);
    hub.publishSave(saved);
    res.json(saved);
  });

  router.get('/:id/shares', (req, res) => {
    res.json({ shares: documents.listShares(parseId(req.params.id), currentUser(req).id) });
  });

  router.post('/:id/shares', (req, res) => {
    const { email, role } = shareSchema.parse(req.body);
    const target = auth.findUserByEmail(email);
    if (!target) throw new HttpError(404, `No account found for ${email}.`, 'user_not_found');

    res.json({ shares: documents.share(parseId(req.params.id), currentUser(req).id, target, role) });
  });

  router.delete('/:id/shares/:userId', (req, res) => {
    const id = parseId(req.params.id);
    const userId = parseId(req.params.userId, 'User');
    const shares = documents.revoke(id, currentUser(req).id, userId);
    hub.kick(id, userId);
    res.json({ shares });
  });

  return router;
}

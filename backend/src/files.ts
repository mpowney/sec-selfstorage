import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database.js';
import { encryptFile, decryptFile } from './encryption.js';
import type { FileRecord } from './types.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Authentication middleware
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

router.use(requireAuth);

// GET /files - list user's files
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    type FileRow = {
      id: string;
      user_id: string;
      credential_id: string;
      filename: string;
      mime_type: string;
      size: number;
      iv: string;
      auth_tag: string;
      uploaded_at: string;
    };

    const rows = db
      .prepare(
        `SELECT id, user_id, credential_id, filename, mime_type, size, iv, auth_tag, uploaded_at
         FROM files WHERE user_id = ? ORDER BY uploaded_at DESC`,
      )
      .all(req.session.userId) as FileRow[];

    const files: FileRecord[] = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      credentialId: r.credential_id,
      filename: r.filename,
      mimeType: r.mime_type,
      size: r.size,
      iv: r.iv,
      authTag: r.auth_tag,
      uploadedAt: r.uploaded_at,
    }));

    res.json(files);
  } catch (err) {
    console.error('files list error:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// POST /files/upload - upload and encrypt a file
router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const { credentialId } = req.body as { credentialId?: string };
    if (!credentialId) {
      res.status(400).json({ error: 'credentialId is required' });
      return;
    }

    const db = getDb();

    // Verify the credential belongs to the authenticated user
    const credRow = db
      .prepare('SELECT id FROM credentials WHERE credential_id = ? AND user_id = ?')
      .get(credentialId, req.session.userId) as { id: string } | undefined;

    if (!credRow) {
      res.status(403).json({ error: 'Credential does not belong to this user' });
      return;
    }

    const fileId = uuidv4();
    const { encrypted, iv, authTag } = encryptFile(req.file.buffer, fileId, credentialId);

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO files (id, user_id, credential_id, filename, mime_type, size, encrypted_data, iv, auth_tag, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      fileId,
      req.session.userId,
      credentialId,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      encrypted,
      iv,
      authTag,
      now,
    );

    const fileRecord: FileRecord = {
      id: fileId,
      userId: req.session.userId as string,
      credentialId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      iv,
      authTag,
      uploadedAt: now,
    };

    res.status(201).json(fileRecord);
  } catch (err) {
    console.error('file upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /files/:id/download - decrypt and return file
router.get('/:id/download', (req: Request, res: Response) => {
  try {
    const db = getDb();

    type FileRow = {
      id: string;
      user_id: string;
      credential_id: string;
      filename: string;
      mime_type: string;
      encrypted_data: Buffer;
      iv: string;
      auth_tag: string;
    };

    const row = db
      .prepare(
        `SELECT id, user_id, credential_id, filename, mime_type, encrypted_data, iv, auth_tag
         FROM files WHERE id = ? AND user_id = ?`,
      )
      .get(req.params['id'], req.session.userId) as FileRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const decrypted = decryptFile(row.encrypted_data, row.iv, row.auth_tag, row.id, row.credential_id);

    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
    res.setHeader('Content-Length', decrypted.length);
    res.send(decrypted);
  } catch (err) {
    console.error('file download error:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// DELETE /files/:id - delete a file
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();

    const result = db
      .prepare('DELETE FROM files WHERE id = ? AND user_id = ?')
      .run(req.params['id'], req.session.userId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('file delete error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// GET /files/:id/info - get file metadata
router.get('/:id/info', (req: Request, res: Response) => {
  try {
    const db = getDb();

    type FileRow = {
      id: string;
      user_id: string;
      credential_id: string;
      filename: string;
      mime_type: string;
      size: number;
      iv: string;
      auth_tag: string;
      uploaded_at: string;
    };

    const row = db
      .prepare(
        `SELECT id, user_id, credential_id, filename, mime_type, size, iv, auth_tag, uploaded_at
         FROM files WHERE id = ? AND user_id = ?`,
      )
      .get(req.params['id'], req.session.userId) as FileRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const fileRecord: FileRecord = {
      id: row.id,
      userId: row.user_id,
      credentialId: row.credential_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size,
      iv: row.iv,
      authTag: row.auth_tag,
      uploadedAt: row.uploaded_at,
    };

    res.json(fileRecord);
  } catch (err) {
    console.error('file info error:', err);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

export default router;

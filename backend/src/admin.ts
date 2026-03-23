import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from './database.js';

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }
  next();
}

// GET /admin/status
router.get('/status', (req: Request, res: Response) => {
  if (req.session.isAdmin) {
    res.json({ authenticated: true, username: req.session.adminUsername });
  } else {
    res.json({ authenticated: false });
  }
});

// POST /admin/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const db = getDb();
    type AdminRow = { id: string; username: string; password_hash: string };
    const admin = db
      .prepare('SELECT id, username, password_hash FROM admin_accounts WHERE username = ?')
      .get(username) as AdminRow | undefined;

    if (!admin) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    req.session.isAdmin = true;
    req.session.adminUsername = admin.username;
    // Ensure regular user session fields are not set for admin sessions
    delete req.session.userId;
    delete req.session.username;
    delete req.session.credentialId;

    res.json({ success: true, username: admin.username });
  } catch (err) {
    console.error('admin login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// POST /admin/logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.json({ success: true });
  });
});

// GET /admin/users — list all regular users with last login info
router.get('/users', requireAdmin, (req: Request, res: Response) => {
  try {
    const db = getDb();
    type UserRow = {
      id: string;
      username: string;
      display_name: string;
      created_at: string;
      last_login_at: string | null;
      last_login_e2e: number;
    };
    const users = db
      .prepare(
        'SELECT id, username, display_name, created_at, last_login_at, last_login_e2e FROM users ORDER BY created_at DESC',
      )
      .all() as UserRow[];

    res.json(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at ?? null,
        lastLoginE2e: u.last_login_e2e === 1,
      })),
    );
  } catch (err) {
    console.error('admin list users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// DELETE /admin/users/:id — delete a user and all their data
router.delete('/users/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.params['id'];

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: string } | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Delete in dependency order
    db.prepare('DELETE FROM files WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM credentials WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM challenges WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ success: true });
  } catch (err) {
    console.error('admin delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /admin/users/:userId/credentials — list a user's registered authenticators
router.get('/users/:userId/credentials', requireAdmin, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { userId } = req.params;

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: string } | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    type CredRow = { credential_id: string; transports: string; created_at: string };
    const rows = db
      .prepare('SELECT credential_id, transports, created_at FROM credentials WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId) as CredRow[];

    res.json(
      rows.map((r) => ({
        credentialId: r.credential_id,
        transports: JSON.parse(r.transports) as string[],
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    console.error('admin list credentials error:', err);
    res.status(500).json({ error: 'Failed to list credentials' });
  }
});

// DELETE /admin/users/:userId/credentials/:credentialId — revoke a single authenticator
// The user must have at least one other authenticator; the last authenticator cannot be revoked.
router.delete('/users/:userId/credentials/:credentialId', requireAdmin, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { userId, credentialId } = req.params;

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: string } | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const count = (
      db.prepare('SELECT COUNT(*) AS cnt FROM credentials WHERE user_id = ?').get(userId) as { cnt: number }
    ).cnt;

    if (count <= 1) {
      res.status(400).json({ error: 'Cannot revoke the last authenticator. Delete the user instead.' });
      return;
    }

    const cred = db
      .prepare('SELECT id FROM credentials WHERE credential_id = ? AND user_id = ?')
      .get(credentialId, userId) as { id: string } | undefined;

    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    // Remove the credential and its wrapped key entry
    db.prepare('DELETE FROM user_wrapped_keys WHERE user_id = ? AND credential_id = ?').run(userId, credentialId);
    db.prepare('DELETE FROM credentials WHERE credential_id = ? AND user_id = ?').run(credentialId, userId);

    res.json({ success: true });
  } catch (err) {
    console.error('admin revoke credential error:', err);
    res.status(500).json({ error: 'Failed to revoke credential' });
  }
});

export default router;

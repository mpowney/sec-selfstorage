import { Router, Request, Response, NextFunction } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/types';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database.js';

const router = Router();

const RP_ID = process.env['RP_ID'] ?? 'localhost';
const RP_NAME = process.env['RP_NAME'] ?? 'SecSelfStorage';
const RP_ORIGIN = process.env['RP_ORIGIN'] ?? 'http://localhost:3000';

// GET /auth/status
router.get('/status', (req: Request, res: Response) => {
  if (req.session.userId) {
    res.json({ authenticated: true, userId: req.session.userId, username: req.session.username, credentialId: req.session.credentialId });
  } else {
    res.json({ authenticated: false });
  }
});

// GET /auth/register/start/:username
router.get('/register/start/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const db = getDb();

    // Find existing credentials for this username to exclude them
    const existingUser = db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(username) as { id: string } | undefined;

    type CredRow = { credential_id: string; transports: string };
    let excludeCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = [];
    if (existingUser) {
      const creds = db
        .prepare('SELECT credential_id, transports FROM credentials WHERE user_id = ?')
        .all(existingUser.id) as CredRow[];
      excludeCredentials = creds.map((c) => ({
        id: c.credential_id,
        transports: JSON.parse(c.transports) as AuthenticatorTransportFuture[],
      }));
    }

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store challenge in DB
    const challengeId = uuidv4();
    db.prepare('INSERT INTO challenges (id, challenge, user_id, created_at) VALUES (?, ?, ?, ?)').run(
      challengeId,
      options.challenge,
      existingUser?.id ?? null,
      new Date().toISOString(),
    );

    res.json({ options, challengeId, username });
  } catch (err) {
    console.error('register/start error:', err);
    res.status(500).json({ error: 'Failed to start registration' });
  }
});

// POST /auth/register/finish
router.post('/register/finish', async (req: Request, res: Response) => {
  try {
    const { response, credential, challengeId, username, displayName } = req.body as {
      response: unknown;
      credential?: unknown;
      challengeId: string;
      username: string;
      displayName?: string;
    };

    const webauthnResponse = response ?? credential;

    if (!webauthnResponse || !challengeId || !username) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const db = getDb();

    type ChallengeRow = { id: string; challenge: string; user_id: string | null };
    const challengeRow = db
      .prepare('SELECT id, challenge, user_id FROM challenges WHERE id = ?')
      .get(challengeId) as ChallengeRow | undefined;

    if (!challengeRow) {
      res.status(400).json({ error: 'Invalid or expired challenge' });
      return;
    }

    const verification = await verifyRegistrationResponse({
      response: webauthnResponse as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Registration verification failed' });
      return;
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    // Upsert user
    let userId = challengeRow.user_id;
    if (!userId) {
      userId = uuidv4();
      db.prepare(
        'INSERT INTO users (id, username, display_name, created_at) VALUES (?, ?, ?, ?)',
      ).run(userId, username, displayName ?? username, new Date().toISOString());
    }

    // Get transports from the response if available
    const authResponse = webauthnResponse as { response?: { transports?: AuthenticatorTransportFuture[] } };
    const transports: AuthenticatorTransportFuture[] = authResponse.response?.transports ?? [];

    // Store credential (credentialID is already base64url string, publicKey stored as hex)
    db.prepare(
      'INSERT INTO credentials (id, user_id, credential_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      uuidv4(),
      userId,
      credentialID,
      Buffer.from(credentialPublicKey).toString('hex'),
      counter,
      JSON.stringify(transports),
      new Date().toISOString(),
    );

    // Clean up challenge
    db.prepare('DELETE FROM challenges WHERE id = ?').run(challengeId);

    res.json({ verified: true, userId });
  } catch (err) {
    console.error('register/finish error:', err);
    res.status(500).json({ error: 'Failed to finish registration' });
  }
});

// POST /auth/login/start
router.post('/login/start', async (req: Request, res: Response) => {
  try {
    const { username } = req.body as { username: string };
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const db = getDb();

    type UserRow = { id: string; username: string; display_name: string };
    const user = db
      .prepare('SELECT id, username, display_name FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    type CredRow = { credential_id: string; transports: string };
    const creds = db
      .prepare('SELECT credential_id, transports FROM credentials WHERE user_id = ?')
      .all(user.id) as CredRow[];

    const allowCredentials = creds.map((c) => ({
      id: c.credential_id,
      transports: JSON.parse(c.transports) as AuthenticatorTransportFuture[],
    }));

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });

    const challengeId = uuidv4();
    db.prepare('INSERT INTO challenges (id, challenge, user_id, created_at) VALUES (?, ?, ?, ?)').run(
      challengeId,
      options.challenge,
      user.id,
      new Date().toISOString(),
    );

    res.json({ options, challengeId });
  } catch (err) {
    console.error('login/start error:', err);
    res.status(500).json({ error: 'Failed to start login' });
  }
});

// POST /auth/login/finish
router.post('/login/finish', async (req: Request, res: Response) => {
  try {
    const { response, credential: legacyCredential, challengeId } = req.body as {
      response: unknown;
      credential?: unknown;
      challengeId: string;
    };

    const webauthnResponse = response ?? legacyCredential;

    if (!webauthnResponse || !challengeId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const db = getDb();

    type ChallengeRow = { id: string; challenge: string; user_id: string };
    const challengeRow = db
      .prepare('SELECT id, challenge, user_id FROM challenges WHERE id = ?')
      .get(challengeId) as ChallengeRow | undefined;

    if (!challengeRow || !challengeRow.user_id) {
      res.status(400).json({ error: 'Invalid or expired challenge' });
      return;
    }

    // Get the credential ID from the response
    const authResponse = webauthnResponse as { id?: string; rawId?: string };
    const responseCredentialId = authResponse.id ?? authResponse.rawId;
    if (!responseCredentialId) {
      res.status(400).json({ error: 'Missing credential ID in response' });
      return;
    }

    type CredRow = { credential_id: string; public_key: string; counter: number; transports: string };
    const credential = db
      .prepare('SELECT credential_id, public_key, counter, transports FROM credentials WHERE user_id = ? AND credential_id = ?')
      .get(challengeRow.user_id, responseCredentialId) as CredRow | undefined;

    if (!credential) {
      res.status(400).json({ error: 'Credential not found' });
      return;
    }

    const authenticator = {
      credentialID: credential.credential_id,
      credentialPublicKey: new Uint8Array(Buffer.from(credential.public_key, 'hex')),
      counter: credential.counter,
      transports: JSON.parse(credential.transports) as AuthenticatorTransportFuture[],
    };

    const verification = await verifyAuthenticationResponse({
      response: webauthnResponse as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      authenticator,
    });

    if (!verification.verified) {
      res.status(401).json({ error: 'Authentication verification failed' });
      return;
    }

    // Update counter
    db.prepare('UPDATE credentials SET counter = ? WHERE credential_id = ?').run(
      verification.authenticationInfo.newCounter,
      credential.credential_id,
    );

    // Clean up challenge
    db.prepare('DELETE FROM challenges WHERE id = ?').run(challengeId);

    // Get user info
    type UserRow = { id: string; username: string };
    const user = db
      .prepare('SELECT id, username FROM users WHERE id = ?')
      .get(challengeRow.user_id) as UserRow;

    // Record last login timestamp and e2e encryption status
    const { e2eEncrypted } = req.body as { e2eEncrypted?: boolean };
    db.prepare('UPDATE users SET last_login_at = ?, last_login_e2e = ? WHERE id = ?').run(
      new Date().toISOString(),
      e2eEncrypted ? 1 : 0,
      user.id,
    );

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.credentialId = credential.credential_id;

    res.json({ verified: true, userId: user.id, username: user.username, credentialId: credential.credential_id });
  } catch (err) {
    console.error('login/finish error:', err);
    res.status(500).json({ error: 'Failed to finish login' });
  }
});

// POST /auth/logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.json({ success: true });
  });
});

// ─── Authenticated-user-only middleware ──────────────────────────────────────

function requireUserAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

// GET /auth/credentials — list credentials registered to the current user
router.get('/credentials', requireUserAuth, (req: Request, res: Response) => {
  try {
    const db = getDb();
    type CredRow = { credential_id: string; transports: string; created_at: string };
    const rows = db
      .prepare('SELECT credential_id, transports, created_at FROM credentials WHERE user_id = ? ORDER BY created_at ASC')
      .all(req.session.userId) as CredRow[];

    const credentials = rows.map((r) => ({
      credentialId: r.credential_id,
      transports: JSON.parse(r.transports) as AuthenticatorTransportFuture[],
      createdAt: r.created_at,
    }));

    res.json({ credentials });
  } catch (err) {
    console.error('credentials list error:', err);
    res.status(500).json({ error: 'Failed to list credentials' });
  }
});

// GET /auth/add-credential/start — begin registering an additional authenticator
// Requires an active authenticated session.
router.get('/add-credential/start', requireUserAuth, async (req: Request, res: Response) => {
  try {
    const db = getDb();

    type CredRow = { credential_id: string; transports: string };
    const existing = db
      .prepare('SELECT credential_id, transports FROM credentials WHERE user_id = ?')
      .all(req.session.userId) as CredRow[];

    const excludeCredentials = existing.map((c) => ({
      id: c.credential_id,
      transports: JSON.parse(c.transports) as AuthenticatorTransportFuture[],
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: req.session.username as string,
      userDisplayName: req.session.username as string,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    const challengeId = uuidv4();
    db.prepare('INSERT INTO challenges (id, challenge, user_id, created_at) VALUES (?, ?, ?, ?)').run(
      challengeId,
      options.challenge,
      req.session.userId,
      new Date().toISOString(),
    );

    res.json({ options, challengeId });
  } catch (err) {
    console.error('add-credential/start error:', err);
    res.status(500).json({ error: 'Failed to start credential registration' });
  }
});

// POST /auth/add-credential/finish — complete registering an additional authenticator
router.post('/add-credential/finish', requireUserAuth, async (req: Request, res: Response) => {
  try {
    const { response, challengeId } = req.body as { response: unknown; challengeId: string };

    if (!response || !challengeId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const db = getDb();

    type ChallengeRow = { id: string; challenge: string; user_id: string | null };
    const challengeRow = db
      .prepare('SELECT id, challenge, user_id FROM challenges WHERE id = ?')
      .get(challengeId) as ChallengeRow | undefined;

    if (!challengeRow || challengeRow.user_id !== req.session.userId) {
      res.status(400).json({ error: 'Invalid or expired challenge' });
      return;
    }

    const verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Credential verification failed' });
      return;
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    const authResponse = response as { response?: { transports?: AuthenticatorTransportFuture[] } };
    const transports: AuthenticatorTransportFuture[] = authResponse.response?.transports ?? [];

    db.prepare(
      'INSERT INTO credentials (id, user_id, credential_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      uuidv4(),
      req.session.userId,
      credentialID,
      Buffer.from(credentialPublicKey).toString('hex'),
      counter,
      JSON.stringify(transports),
      new Date().toISOString(),
    );

    db.prepare('DELETE FROM challenges WHERE id = ?').run(challengeId);

    res.json({ verified: true });
  } catch (err) {
    console.error('add-credential/finish error:', err);
    res.status(500).json({ error: 'Failed to finish credential registration' });
  }
});

// GET /auth/wrapped-key — retrieve the wrapped master key for the current session's credential
// Returns { wrappedKey, iv } or { wrappedKey: null } if not yet set up.
router.get('/wrapped-key', requireUserAuth, (req: Request, res: Response) => {
  try {
    const db = getDb();
    type Row = { wrapped_key: string; iv: string };
    const row = db
      .prepare('SELECT wrapped_key, iv FROM user_wrapped_keys WHERE user_id = ? AND credential_id = ?')
      .get(req.session.userId, req.session.credentialId) as Row | undefined;

    if (!row) {
      res.json({ wrappedKey: null });
      return;
    }
    res.json({ wrappedKey: row.wrapped_key, iv: row.iv });
  } catch (err) {
    console.error('wrapped-key get error:', err);
    res.status(500).json({ error: 'Failed to retrieve wrapped key' });
  }
});

// POST /auth/wrapped-key — store (or update) the wrapped master key for a credential
// Body: { credentialId, wrappedKey, iv }
// The credential must belong to the current authenticated user.
router.post('/wrapped-key', requireUserAuth, (req: Request, res: Response) => {
  try {
    const { credentialId, wrappedKey, iv } = req.body as {
      credentialId?: string;
      wrappedKey?: string;
      iv?: string;
    };

    if (!credentialId || !wrappedKey || !iv) {
      res.status(400).json({ error: 'Missing required fields: credentialId, wrappedKey, iv' });
      return;
    }

    const db = getDb();

    // Verify the target credential belongs to the authenticated user
    const credRow = db
      .prepare('SELECT id FROM credentials WHERE credential_id = ? AND user_id = ?')
      .get(credentialId, req.session.userId) as { id: string } | undefined;

    if (!credRow) {
      res.status(403).json({ error: 'Credential does not belong to this user' });
      return;
    }

    db.prepare(`
      INSERT INTO user_wrapped_keys (id, user_id, credential_id, wrapped_key, iv, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, credential_id) DO UPDATE SET wrapped_key = excluded.wrapped_key, iv = excluded.iv
    `).run(uuidv4(), req.session.userId, credentialId, wrappedKey, iv, new Date().toISOString());

    res.json({ success: true });
  } catch (err) {
    console.error('wrapped-key post error:', err);
    res.status(500).json({ error: 'Failed to store wrapped key' });
  }
});

export default router;

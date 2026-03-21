import { Router, Request, Response } from 'express';
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
    res.json({ authenticated: true, userId: req.session.userId, username: req.session.username });
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
    const { response, challengeId, username, displayName } = req.body as {
      response: unknown;
      challengeId: string;
      username: string;
      displayName?: string;
    };

    if (!response || !challengeId || !username) {
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
      response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
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
    const authResponse = response as { response?: { transports?: AuthenticatorTransportFuture[] } };
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
    const { response, challengeId } = req.body as {
      response: unknown;
      challengeId: string;
    };

    if (!response || !challengeId) {
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
    const authResponse = response as { id?: string; rawId?: string };
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
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
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

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;

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

export default router;

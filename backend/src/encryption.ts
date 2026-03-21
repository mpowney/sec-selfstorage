import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

const SYSTEM_KEY_ENV = 'SYSTEM_ENCRYPTION_KEY';

export function getSystemKey(): Buffer {
  const keyHex = process.env[SYSTEM_KEY_ENV];
  if (!keyHex) throw new Error('SYSTEM_ENCRYPTION_KEY env var not set');
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('SYSTEM_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return key;
}

export function deriveFileKey(fileId: string, credentialId: string): Buffer {
  const systemKey = getSystemKey();
  const info = Buffer.from(`file-encryption:${fileId}:${credentialId}`);
  const derived = hkdfSync('sha256', systemKey, Buffer.alloc(0), info, 32);
  return Buffer.from(derived);
}

export function encryptFile(
  data: Buffer,
  fileId: string,
  credentialId: string,
): { encrypted: Buffer; iv: string; authTag: string } {
  const key = deriveFileKey(fileId, credentialId);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv: iv.toString('hex'), authTag: authTag.toString('hex') };
}

export function decryptFile(
  encrypted: Buffer,
  iv: string,
  authTag: string,
  fileId: string,
  credentialId: string,
): Buffer {
  const key = deriveFileKey(fileId, credentialId);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

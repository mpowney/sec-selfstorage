import { SessionData } from 'express-session';

export interface StoredCredential {
  credentialID: string;       // base64url encoded
  credentialPublicKey: string; // hex encoded
  counter: number;
  transports: string[];
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  credentials: StoredCredential[];
}

export interface FileRecord {
  id: string;
  userId: string;
  credentialId: string;
  filename: string;
  mimeType: string;
  size: number;
  iv: string;
  authTag: string;
  uploadedAt: string;
  folderPath: string;
  clientEncrypted: boolean;
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
    username: string;
    credentialId: string;
    challengeId: string;
    csrfToken: string;
    isAdmin: boolean;
    adminUsername: string;
  }
}

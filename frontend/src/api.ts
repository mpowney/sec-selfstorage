import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from './webauthn';
import { clientEncryptFile, clientDecryptFile } from './webauthn';

export type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
};

// Auth API
export interface AuthStatus {
  authenticated: boolean;
  userId?: string;
  username?: string;
  credentialId?: string;
}

export interface RegistrationStartResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeId: string;
}

export interface AuthenticationStartResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeId: string;
}

export interface FileRecord {
  id: string;
  userId: string;
  credentialId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  folderPath: string;
  clientEncrypted: boolean;
  /** Authentication mechanisms active at upload time: "server", "e2e-roaming", "e2e-platform", "e2e-hybrid", "e2e-unknown" */
  authMechanisms: string;
}

// CSRF token cache — fetched once per page load
let cachedCsrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  const res = await fetch('/api/csrf-token', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get CSRF token');
  const data = await res.json() as { csrfToken: string };
  cachedCsrfToken = data.csrfToken;
  return cachedCsrfToken;
}

export function clearCsrfToken(): void {
  cachedCsrfToken = null;
}

async function csrfHeaders(): Promise<Record<string, string>> {
  const token = await getCsrfToken();
  return { 'X-CSRF-Token': token };
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get auth status');
  return res.json() as Promise<AuthStatus>;
}

export async function startRegistration(username: string): Promise<RegistrationStartResponse> {
  const res = await fetch(`/api/auth/register/start/${encodeURIComponent(username)}`, { credentials: 'include' });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Registration start failed');
  return res.json() as Promise<RegistrationStartResponse>;
}

export async function finishRegistration(
  credential: RegistrationResponseJSON,
  challengeId: string,
  username: string,
): Promise<{ success: boolean }> {
  const res = await fetch('/api/auth/register/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ response: credential, challengeId, username }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Registration finish failed');
  return res.json() as Promise<{ success: boolean }>;
}

export async function startLogin(username: string): Promise<AuthenticationStartResponse> {
  const res = await fetch('/api/auth/login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Login start failed');
  return res.json() as Promise<AuthenticationStartResponse>;
}

export async function finishLogin(
  credential: AuthenticationResponseJSON,
  challengeId: string,
  e2eEncrypted: boolean,
): Promise<{ success: boolean; userId: string; username: string; credentialId: string }> {
  const res = await fetch('/api/auth/login/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ response: credential, challengeId, e2eEncrypted }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Login failed');
  return res.json() as Promise<{ success: boolean; userId: string; username: string; credentialId: string }>;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: await csrfHeaders(),
    credentials: 'include',
  });
  clearCsrfToken();
}

export async function listFiles(folder = ''): Promise<{ files: FileRecord[]; folders: string[] }> {
  const params = new URLSearchParams({ folder });
  const res = await fetch(`/api/files?${params.toString()}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list files');
  return res.json() as Promise<{ files: FileRecord[]; folders: string[] }>;
}

export async function uploadFile(
  file: File,
  credentialId: string,
  folderPath: string,
  clientKey: CryptoKey | null,
  onProgress?: (pct: number) => void,
): Promise<FileRecord> {
  const csrfToken = await getCsrfToken();

  // Client-side encryption (inner layer): encrypt before sending to server
  let filePayload: Blob;
  if (clientKey) {
    const encrypted = await clientEncryptFile(await file.arrayBuffer(), clientKey);
    filePayload = new Blob([encrypted], { type: 'application/octet-stream' });
  } else {
    filePayload = file;
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', filePayload, file.name);
    formData.append('credentialId', credentialId);
    formData.append('folderPath', folderPath);
    // When client-encrypted, pass the original MIME type and size so the server
    // stores them correctly (the uploaded blob is ciphertext, not the raw file)
    if (clientKey) {
      formData.append('mimeType', file.type);
      formData.append('originalSize', String(file.size));
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as FileRecord);
      } else {
        try {
          reject(new Error((JSON.parse(xhr.responseText) as { error?: string }).error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(formData);
  });
}

export async function downloadFile(fileId: string, filename: string, mimeType: string, clientKey: CryptoKey | null): Promise<void> {
  const res = await fetch(`/api/files/${fileId}/download`, { credentials: 'include' });
  if (!res.ok) throw new Error('Download failed');
  const data = await res.arrayBuffer();
  const decrypted = await clientDecryptFile(data, clientKey);
  const blob = new Blob([decrypted], { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function previewFile(fileId: string, mimeType: string, clientKey: CryptoKey | null): Promise<{ url: string; mimeType: string }> {
  const res = await fetch(`/api/files/${fileId}/download`, { credentials: 'include' });
  if (!res.ok) throw new Error('Preview failed');
  const data = await res.arrayBuffer();
  const decrypted = await clientDecryptFile(data, clientKey);
  const blob = new Blob([decrypted], { type: mimeType || 'application/octet-stream' });
  return { url: URL.createObjectURL(blob), mimeType };
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await fetch(`/api/files/${fileId}`, {
    method: 'DELETE',
    headers: await csrfHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Delete failed');
}

// Admin API

export interface AdminUser {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginE2e: boolean;
}

export interface AdminStatus {
  authenticated: boolean;
  username?: string;
}

export async function getAdminStatus(): Promise<AdminStatus> {
  const res = await fetch('/api/admin/status', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get admin status');
  return res.json() as Promise<AdminStatus>;
}

export async function adminLogin(username: string, password: string): Promise<{ success: boolean; username: string }> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Login failed');
  return res.json() as Promise<{ success: boolean; username: string }>;
}

export async function adminLogout(): Promise<void> {
  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: await csrfHeaders(),
    credentials: 'include',
  });
  clearCsrfToken();
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/admin/users', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list users');
  return res.json() as Promise<AdminUser[]>;
}

export async function deleteAdminUser(userId: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: await csrfHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete user');
}

// Credential management API

export interface CredentialInfo {
  credentialId: string;
  transports: string[];
  createdAt: string;
  nameEncrypted: string | null;
}

export async function listCredentials(): Promise<CredentialInfo[]> {
  const res = await fetch('/api/auth/credentials', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list credentials');
  const data = await res.json() as { credentials: CredentialInfo[] };
  return data.credentials;
}

export async function getWrappedKey(): Promise<{ wrappedKey: string; iv: string } | null> {
  const res = await fetch('/api/auth/wrapped-key', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get wrapped key');
  const data = await res.json() as { wrappedKey: string | null; iv?: string };
  if (!data.wrappedKey) return null;
  return { wrappedKey: data.wrappedKey, iv: data.iv as string };
}

export async function startAddCredential(): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
  const res = await fetch('/api/auth/add-credential/start', { credentials: 'include' });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Failed to start adding credential');
  return res.json() as Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>;
}

export async function storeWrappedKey(credentialId: string, wrappedKey: string, iv: string): Promise<void> {
  const res = await fetch('/api/auth/wrapped-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ credentialId, wrappedKey, iv }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Failed to store wrapped key');
}

export async function finishAddCredential(
  credential: RegistrationResponseJSON,
  challengeId: string,
): Promise<{ verified: boolean }> {
  const res = await fetch('/api/auth/add-credential/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ response: credential, challengeId }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Failed to add credential');
  return res.json() as Promise<{ verified: boolean }>;
}

export async function updateCredentialName(credentialId: string, nameEncrypted: string | null): Promise<void> {
  const res = await fetch(`/api/auth/credentials/${encodeURIComponent(credentialId)}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ nameEncrypted }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Failed to update credential name');
}

// Admin credential management API

export interface AdminCredential {
  credentialId: string;
  transports: string[];
  createdAt: string;
}

export async function listAdminUserCredentials(userId: string): Promise<AdminCredential[]> {
  const res = await fetch(`/api/admin/users/${userId}/credentials`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list credentials');
  return res.json() as Promise<AdminCredential[]>;
}

export async function revokeAdminUserCredential(userId: string, credentialId: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
    headers: await csrfHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || 'Failed to revoke credential');
}

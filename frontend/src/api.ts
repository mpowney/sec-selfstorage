import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from './webauthn';

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
  displayName: string,
): Promise<{ success: boolean }> {
  const res = await fetch('/api/auth/register/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ credential, challengeId, username, displayName }),
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
): Promise<{ success: boolean; userId: string; username: string; credentialId: string }> {
  const res = await fetch('/api/auth/login/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
    credentials: 'include',
    body: JSON.stringify({ credential, challengeId }),
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

export async function listFiles(): Promise<FileRecord[]> {
  const res = await fetch('/api/files', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list files');
  return res.json() as Promise<FileRecord[]>;
}

export async function uploadFile(
  file: File,
  credentialId: string,
  onProgress?: (pct: number) => void,
): Promise<FileRecord> {
  const csrfToken = await getCsrfToken();
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('credentialId', credentialId);
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

export async function downloadFile(fileId: string, filename: string): Promise<void> {
  const res = await fetch(`/api/files/${fileId}/download`, { credentials: 'include' });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await fetch(`/api/files/${fileId}`, {
    method: 'DELETE',
    headers: await csrfHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Delete failed');
}

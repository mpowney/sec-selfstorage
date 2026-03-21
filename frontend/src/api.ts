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

export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get auth status');
  return res.json();
}

export async function startRegistration(username: string): Promise<RegistrationStartResponse> {
  const res = await fetch(`/api/auth/register/start/${encodeURIComponent(username)}`, { credentials: 'include' });
  if (!res.ok) throw new Error((await res.json()).error || 'Registration start failed');
  return res.json();
}

export async function finishRegistration(
  credential: RegistrationResponseJSON,
  challengeId: string,
  username: string,
  displayName: string,
): Promise<{ success: boolean }> {
  const res = await fetch('/api/auth/register/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential, challengeId, username, displayName }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Registration finish failed');
  return res.json();
}

export async function startLogin(username: string): Promise<AuthenticationStartResponse> {
  const res = await fetch('/api/auth/login/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Login start failed');
  return res.json();
}

export async function finishLogin(
  credential: AuthenticationResponseJSON,
  challengeId: string,
): Promise<{ success: boolean; userId: string; username: string; credentialId: string }> {
  const res = await fetch('/api/auth/login/finish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential, challengeId }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Login failed');
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function listFiles(): Promise<FileRecord[]> {
  const res = await fetch('/api/files', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to list files');
  return res.json();
}

export async function uploadFile(
  file: File,
  credentialId: string,
  onProgress?: (pct: number) => void,
): Promise<FileRecord> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('credentialId', credentialId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.withCredentials = true;
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
  const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error('Delete failed');
}

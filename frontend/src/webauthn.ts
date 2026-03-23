// PRF salt — a fixed application-specific constant; all clients must use the same value
// so that the YubiKey produces the same PRF output on every authentication
const PRF_SALT: ArrayBuffer = new TextEncoder().encode('sec-selfstorage-client-encryption-v1').buffer as ArrayBuffer;

// PRF extension result types (not yet in standard WebAuthn TypeScript definitions)
interface PRFExtensionResult {
  results?: { first?: ArrayBuffer };
}
interface ExtensionResultsWithPRF {
  prf?: PRFExtensionResult;
}

// Magic marker prefix written at the start of every client-encrypted blob: bytes for "SCE1"
const CLIENT_ENC_MAGIC = new Uint8Array([0x53, 0x43, 0x45, 0x31]);
const MAGIC_LEN = 4;
const IV_LEN = 12;

/**
 * Derive an AES-256-GCM key from the raw PRF output using HKDF.
 * The key is extractable so it can be wrapped (encrypted) for storage and shared
 * across multiple credentials via the master key scheme.
 */
export async function deriveClientKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', prfOutput, { name: 'HKDF' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('sec-selfstorage-aes-key-v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable so the key can be wrapped for additional credentials
    ['encrypt', 'decrypt'],
  );
}

/**
 * Derive an AES-256-GCM wrapping key from the raw PRF output using HKDF.
 * Uses a different HKDF info string from deriveClientKey so the two keys are
 * cryptographically independent. The wrapping key is used only to encrypt/decrypt
 * the master key blob stored on the server; it never touches file data directly.
 */
export async function deriveWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', prfOutput, { name: 'HKDF' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('sec-selfstorage-key-wrapping-v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt (wrap) a master CryptoKey with a wrapping key.
 * The master key is exported as raw bytes and then AES-GCM encrypted.
 * Returns base64url-encoded wrapped key bytes and IV.
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<{ wrappedKey: string; iv: string }> {
  const rawKey = await crypto.subtle.exportKey('raw', masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, rawKey);
  return {
    wrappedKey: arrayBufferToBase64url(wrapped),
    iv: arrayBufferToBase64url(iv.buffer),
  };
}

/**
 * Decrypt (unwrap) a wrapped master key using a wrapping key.
 * Returns an extractable AES-256-GCM CryptoKey so it can in turn be wrapped for
 * additional credentials.
 */
export async function unwrapMasterKey(
  wrappedKey: string,
  iv: string,
  wrappingKey: CryptoKey,
): Promise<CryptoKey> {
  const wrappedBytes = base64urlToArrayBuffer(wrappedKey);
  const ivBytes = base64urlToArrayBuffer(iv);
  const rawKey = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, wrappingKey, wrappedBytes);
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/**
 * Encrypt plaintext with the client key.
 * Output format: [4-byte magic] [12-byte IV] [AES-GCM ciphertext + 16-byte auth tag]
 */
export async function clientEncryptFile(plaintext: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const out = new Uint8Array(MAGIC_LEN + IV_LEN + ciphertext.byteLength);
  out.set(CLIENT_ENC_MAGIC, 0);
  out.set(iv, MAGIC_LEN);
  out.set(new Uint8Array(ciphertext), MAGIC_LEN + IV_LEN);
  return out.buffer;
}

/**
 * Decrypt a blob produced by clientEncryptFile.
 * - If the magic marker is absent the data was not client-encrypted; it is returned as-is.
 * - If the marker is present but no key is provided, throws an actionable error.
 */
export async function clientDecryptFile(data: ArrayBuffer, key: CryptoKey | null): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(data);
  const isClientEncrypted =
    bytes.length >= MAGIC_LEN + IV_LEN && CLIENT_ENC_MAGIC.every((b, i) => bytes[i] === b);
  if (!isClientEncrypted) return data;
  if (!key)
    throw new Error(
      'This file is end-to-end encrypted. Sign out and sign in again to unlock it.',
    );
  const iv = bytes.slice(MAGIC_LEN, MAGIC_LEN + IV_LEN);
  const ciphertext = bytes.slice(MAGIC_LEN + IV_LEN);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

// Helper to convert base64url to ArrayBuffer
export function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to convert ArrayBuffer to base64url
export function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export type PublicKeyCredentialCreationOptionsJSON = {
  rp: { name: string; id?: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { alg: number; type: string }[];
  timeout?: number;
  excludeCredentials?: { id: string; type: string; transports?: string[] }[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  extensions?: AuthenticationExtensionsClientInputs;
};

export type RegistrationResponseJSON = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
  type: string;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
};

export type PublicKeyCredentialRequestOptionsJSON = {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: { id: string; type: string; transports?: string[] }[];
  userVerification?: UserVerificationRequirement;
  extensions?: AuthenticationExtensionsClientInputs;
};

export type AuthenticationResponseJSON = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  type: string;
  clientExtensionResults: AuthenticationExtensionsClientOutputs;
};

/** Return value of browserAuthenticate — includes the assertion and any PRF output. */
export type AuthenticationResult = {
  response: AuthenticationResponseJSON;
  /** 32-byte PRF output from the authenticator, or null if PRF is unsupported. */
  prfOutput: ArrayBuffer | null;
};

export async function browserRegister(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToArrayBuffer(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((c) => ({
      id: base64urlToArrayBuffer(c.id),
      type: c.type as PublicKeyCredentialType,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
      ...p,
      type: p.type as PublicKeyCredentialType,
    })),
    // Request PRF at registration so the authenticator initialises the hmac-secret
    // extension for this credential. Without this, PRF will always return null at
    // authentication time for CTAP2 security keys (YubiKeys, etc.).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extensions: { ...options.extensions, prf: {} } as any,
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  if (!credential) throw new Error('No credential returned');

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports = response.getTransports ? response.getTransports() : [];

  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    response: {
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64url(response.attestationObject),
      transports,
    },
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

export async function browserAuthenticate(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResult> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    allowCredentials: options.allowCredentials?.map((c) => ({
      id: base64urlToArrayBuffer(c.id),
      type: c.type as PublicKeyCredentialType,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
    extensions: {
      ...options.extensions,
      // Request the PRF extension so the YubiKey produces a deterministic key-derivation secret.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prf: { eval: { first: PRF_SALT } } as any,
    },
  };

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  if (!credential) throw new Error('No credential returned');

  const response = credential.response as AuthenticatorAssertionResponse;
  const extensions = credential.getClientExtensionResults() as ExtensionResultsWithPRF;
  const prfOutput = extensions.prf?.results?.first ?? null;

  return {
    response: {
      id: credential.id,
      rawId: arrayBufferToBase64url(credential.rawId),
      response: {
        clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
        authenticatorData: arrayBufferToBase64url(response.authenticatorData),
        signature: arrayBufferToBase64url(response.signature),
        userHandle: response.userHandle ? arrayBufferToBase64url(response.userHandle) : undefined,
      },
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults(),
    },
    prfOutput,
  };
}

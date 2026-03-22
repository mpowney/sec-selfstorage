import { Logger } from './logger';

const logger = new Logger('webauthn');

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

/** Convert an ArrayBuffer to a lowercase hex string for logging. */
function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive a non-extractable AES-256-GCM key from the raw PRF output using HKDF.
 */
export async function deriveClientKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  logger.info('deriveClientKey: starting HKDF derivation', {
    prfOutputByteLength: prfOutput.byteLength,
    prfOutputHex: bufferToHex(prfOutput),
  });
  const baseKey = await crypto.subtle.importKey('raw', prfOutput, { name: 'HKDF' }, false, ['deriveKey']);
  logger.info('deriveClientKey: base key imported, deriving AES-256-GCM key via HKDF-SHA-256');
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('sec-selfstorage-aes-key-v1'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  logger.info('deriveClientKey: AES-256-GCM client key derived successfully', {
    algorithm: key.algorithm,
    extractable: key.extractable,
    usages: key.usages,
  });
  return key;
}

/**
 * Encrypt plaintext with the client key.
 * Output format: [4-byte magic] [12-byte IV] [AES-GCM ciphertext + 16-byte auth tag]
 */
export async function clientEncryptFile(plaintext: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  logger.info('clientEncryptFile: encrypting file', { plaintextByteLength: plaintext.byteLength });
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  logger.info('clientEncryptFile: generated random IV', { ivHex: bufferToHex(iv.buffer) });
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  logger.info('clientEncryptFile: AES-GCM encryption complete', {
    ciphertextByteLength: ciphertext.byteLength,
    totalOutputByteLength: MAGIC_LEN + IV_LEN + ciphertext.byteLength,
  });
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
  logger.info('clientDecryptFile: checking magic marker', {
    dataByteLength: data.byteLength,
    isClientEncrypted,
    hasKey: key !== null,
    firstBytesHex: bufferToHex(bytes.slice(0, Math.min(8, bytes.length)).buffer),
  });
  if (!isClientEncrypted) {
    logger.info('clientDecryptFile: no magic marker found — returning data as-is (server-only encryption)');
    return data;
  }
  if (!key) {
    logger.warn('clientDecryptFile: file is client-encrypted but no client key is available');
    throw new Error(
      'This file is end-to-end encrypted. Sign out and sign in again to unlock it.',
    );
  }
  const iv = bytes.slice(MAGIC_LEN, MAGIC_LEN + IV_LEN);
  logger.info('clientDecryptFile: decrypting with AES-GCM', {
    ivHex: bufferToHex(iv.buffer),
    encryptedDataByteLength: bytes.length - MAGIC_LEN - IV_LEN,
  });
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(MAGIC_LEN + IV_LEN));
  logger.info('clientDecryptFile: decryption successful', { plaintextByteLength: plaintext.byteLength });
  return plaintext;
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
  logger.info('browserRegister: preparing PublicKeyCredentialCreationOptions', {
    challenge: options.challenge,
    rpId: options.rp.id,
    rpName: options.rp.name,
    userId: options.user.id,
    userName: options.user.name,
    userDisplayName: options.user.displayName,
    pubKeyCredParams: options.pubKeyCredParams,
    authenticatorSelection: options.authenticatorSelection,
    excludeCredentialsCount: options.excludeCredentials?.length ?? 0,
  });
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

  logger.info('browserRegister: calling navigator.credentials.create — waiting for user gesture (touch authenticator)');
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  if (!credential) throw new Error('No credential returned');
  logger.info('browserRegister: credential created', {
    credentialId: credential.id,
    credentialType: credential.type,
    rawIdHex: bufferToHex(credential.rawId),
  });

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports = response.getTransports ? response.getTransports() : [];
  const extensionResults = credential.getClientExtensionResults();
  logger.info('browserRegister: registration complete', {
    transports,
    clientExtensionResults: extensionResults,
    // Log whether PRF was initialised at registration (required for later auth-time PRF use)
    prfEnabled: !!(extensionResults as Record<string, unknown>)['prf'],
  });

  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    response: {
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64url(response.attestationObject),
      transports,
    },
    type: credential.type,
    clientExtensionResults: extensionResults,
  };
}

export async function browserAuthenticate(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResult> {
  logger.info('browserAuthenticate: preparing PublicKeyCredentialRequestOptions', {
    challenge: options.challenge,
    rpId: options.rpId,
    userVerification: options.userVerification,
    allowCredentials: options.allowCredentials?.map((c) => ({ id: c.id, type: c.type, transports: c.transports })),
    prfSaltHex: bufferToHex(PRF_SALT),
  });
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

  logger.info('browserAuthenticate: calling navigator.credentials.get — waiting for user gesture (touch authenticator)');
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  if (!credential) throw new Error('No credential returned');
  logger.info('browserAuthenticate: credential assertion received', {
    credentialId: credential.id,
    credentialType: credential.type,
    rawIdHex: bufferToHex(credential.rawId),
  });

  const response = credential.response as AuthenticatorAssertionResponse;
  const extensions = credential.getClientExtensionResults() as ExtensionResultsWithPRF;
  const prfOutput = extensions.prf?.results?.first ?? null;

  logger.info('browserAuthenticate: parsed assertion response', {
    authenticatorDataByteLength: response.authenticatorData.byteLength,
    authenticatorDataHex: bufferToHex(response.authenticatorData),
    signatureByteLength: response.signature.byteLength,
    userHandleHex: response.userHandle ? bufferToHex(response.userHandle) : null,
    prfOutputPresent: prfOutput !== null,
    prfOutputHex: prfOutput ? bufferToHex(prfOutput) : null,
    prfOutputByteLength: prfOutput ? prfOutput.byteLength : null,
    clientExtensionResults: extensions,
  });

  if (prfOutput === null) {
    logger.warn(
      'browserAuthenticate: PRF output is null — authenticator does not support PRF or hmac-secret extension. ' +
      'Client-side encryption key cannot be derived from this credential. ' +
      'This is expected on iOS Safari with NFC/USB security keys.',
    );
  } else {
    logger.info('browserAuthenticate: PRF output received — client encryption key can be derived');
  }

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

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
): Promise<AuthenticationResponseJSON> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    allowCredentials: options.allowCredentials?.map((c) => ({
      id: base64urlToArrayBuffer(c.id),
      type: c.type as PublicKeyCredentialType,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  if (!credential) throw new Error('No credential returned');

  const response = credential.response as AuthenticatorAssertionResponse;

  return {
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
  };
}

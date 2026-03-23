# sec-selfstorage

A lightweight, self-hosted secure file storage application with YubiKey-based authentication and encryption.

## Features

- 🔐 **YubiKey authentication** via WebAuthn/FIDO2 (passkey login — no passwords)
- 🔒 **Two-layer file encryption**: system-wide AES-256-GCM key + YubiKey credential-derived key
- 📁 **File upload/download** through a web interface
- 💾 **SQLite storage** — lightweight, easy to back up and restore
- 🐳 **Docker containerised** — runs on Raspberry Pi (arm64) and macOS (amd64)
- 🖥️ **React + Fluent UI v9** frontend

## Architecture

```
┌─────────────────────────────────────┐
│  Browser (React + Fluent UI v9)     │
│  - WebAuthn API for YubiKey         │
│  - File upload/download             │
└──────────────┬──────────────────────┘
               │ HTTP (SSL terminated externally)
┌──────────────▼──────────────────────┐
│  Backend (Node.js v22 + TypeScript) │
│  - Express.js API                   │
│  - WebAuthn verification            │
│  - File encryption/decryption       │
│  - Session management               │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  SQLite Database                    │
│  - Users & credentials              │
│  - Encrypted file blobs             │
│  - Wrapped master keys              │
└─────────────────────────────────────┘
```

### Encryption Architecture

Every file passes through up to two independent encryption layers depending on whether the user has an E2E-capable authenticator registered.

#### Layer 1 — Server-side encryption (always applied)

The server derives a unique AES-256-GCM key for each file using HKDF-SHA256:

```
fileKey = HKDF-SHA256(SYSTEM_ENCRYPTION_KEY, salt=∅, info="file-encryption:{fileId}:{credentialId}")
```

The server encrypts whatever it receives (raw file **or** already client-encrypted blob) with `fileKey` and stores the ciphertext in the database alongside the IV, authentication tag, `fileId`, and `credentialId` in plaintext.

#### Layer 2 — Client-side E2E encryption (applied when an E2E authenticator is active)

When a user has registered a WebAuthn authenticator that supports the [PRF extension](https://www.w3.org/TR/webauthn-3/#prf-extension) (most modern passkeys, YubiKey 5 series, platform authenticators with CTAP2.1), the browser performs an additional encryption layer **before** the server ever sees the file:

```
prfOutput   = authenticator.prf(salt="sec-selfstorage-client-encryption-v1")  # 32-byte hardware HMAC
masterKey   = HKDF-SHA256(prfOutput, info="sec-selfstorage-aes-key-v1")       # AES-256-GCM key
clientBlob  = [4-byte magic "SCE1"] [12-byte IV] [AES-256-GCM(masterKey, rawFile)]
```

The `clientBlob` is what the server receives and subsequently wraps with Layer 1. The server never has access to `prfOutput` or `masterKey`.

#### Master key wrapping — sharing the E2E key across multiple authenticators

To allow files to be decrypted when signing in with **any** of a user's registered authenticators, the master key is stored on the server encrypted ("wrapped") separately for each authenticator:

```
wrappingKey = HKDF-SHA256(prfOutput, info="sec-selfstorage-key-wrapping-v1")  # independent key
wrappedKey  = AES-256-GCM(wrappingKey, raw_master_key)                         # stored in DB
```

The `user_wrapped_keys` table contains one row per (user, credential) pair — each row holds the same master key, but encrypted with that credential's unique `wrappingKey`. Authenticating with any credential that has a wrapped key entry yields the shared master key, enabling decryption of all E2E files regardless of which credential was used to upload them.

#### Encryption flow summary

| Mode | Client encrypts? | Server encrypts? | What attacker needs to read files |
|------|-----------------|-----------------|-----------------------------------|
| Server-only | ✗ | ✓ | `SYSTEM_ENCRYPTION_KEY` + database |
| E2E (one authenticator) | ✓ | ✓ | Physical authenticator + database + `SYSTEM_ENCRYPTION_KEY` |
| E2E (shared master key, multiple authenticators) | ✓ | ✓ | Any registered physical authenticator + database + `SYSTEM_ENCRYPTION_KEY` |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- A YubiKey 5 series (supports FIDO2/WebAuthn)
- A modern browser (Chrome, Firefox, Safari, Edge)

### 1. Generate secrets

```bash
# Generate system encryption key (32 bytes = 64 hex chars)
openssl rand -hex 32

# Generate session secret
openssl rand -hex 32
```

### 2. Create environment file

```bash
cp .env.example .env
# Edit .env and fill in your secrets
```

Or set environment variables directly:

```bash
export SYSTEM_ENCRYPTION_KEY="<your-64-char-hex-key>"
export SESSION_SECRET="<your-session-secret>"
export RP_ID="your-domain.example.com"
export RP_ORIGIN="https://your-domain.example.com"
export RP_NAME="My SecSelfStorage"
```

### 3. Run with Docker Compose

**Production:**
```bash
docker compose up -d
```

**Development (with hot reload):**
```bash
docker compose -f docker-compose.dev.yml up
```

### 4. Access the app

Open `http://localhost:4000` (production) or `http://localhost:3000` (development).

### 5. Register your YubiKey

1. Go to the **Register** tab
2. Enter your username and display name
3. Click **Register YubiKey** and follow the browser prompts
4. Insert your YubiKey and touch it when prompted

### 6. Sign in

1. Go to the **Sign In** tab
2. Enter your username
3. Click **Sign in with YubiKey** and touch your YubiKey

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SYSTEM_ENCRYPTION_KEY` | *(required)* | 32-byte hex-encoded AES-256 master key |
| `SESSION_SECRET` | *(required)* | Secret for session cookie signing |
| `PORT` | `4000` | Backend server port |
| `RP_ID` | `localhost` | WebAuthn Relying Party ID (your domain) |
| `RP_NAME` | `SecSelfStorage` | WebAuthn Relying Party name |
| `RP_ORIGIN` | `http://localhost:3000` | WebAuthn expected origin |
| `DATA_DIR` | `./data` | Directory for SQLite database file |
| `NODE_ENV` | `development` | Set to `production` in production |

### Raspberry Pi Deployment

The Docker image supports `linux/arm64` for Raspberry Pi 4/5.

```bash
# On your Raspberry Pi
git clone https://github.com/mpowney/sec-selfstorage.git
cd sec-selfstorage

export RP_ID="storage.myhome.local"
export RP_ORIGIN="https://storage.myhome.local"
export SYSTEM_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export SESSION_SECRET="$(openssl rand -hex 32)"

docker compose up -d
```

**SSL termination**: Use a reverse proxy like [Caddy](https://caddyserver.com/) or [nginx](https://nginx.org/) for HTTPS. The app listens on HTTP only.

Example Caddy config:
```
storage.myhome.local {
    reverse_proxy localhost:4000 {
        header_up Host {host}
    }
}
```

## Backup & Restore

The entire database (users, credentials, encrypted files) is stored in a single SQLite file:

```bash
# Backup
cp data/storage.db "data/storage.db.$(date +%Y%m%d-%H%M%S)"
```

**Important**: Back up your `SYSTEM_ENCRYPTION_KEY` separately. Without it, encrypted files cannot be decrypted even with a valid YubiKey.

## Development

### Without Docker

**Backend:**
```bash
cd backend
npm install
npm run dev   # tsx watch on port 4000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev   # Vite dev server on port 3000
```

### Build Docker image

```bash
# Multi-platform (Raspberry Pi + macOS/Linux amd64)
docker buildx build --platform linux/amd64,linux/arm64 -t sec-selfstorage .
```

## Security Notes

- SSL/TLS termination should be handled by a reverse proxy (nginx, Caddy, Traefik)
- The YubiKey private key **never leaves the device** — WebAuthn uses challenge-response
- File encryption keys are never stored; they are re-derived on each download
- Session cookies are `httpOnly` and `sameSite: strict`
- The `SYSTEM_ENCRYPTION_KEY` must be kept secret

## Security Architecture, Threat Model, and Known Vulnerabilities

This section documents the security assumptions, attack vectors, and known limitations of the system. Understanding these is important for correctly evaluating whether this application is suitable for your threat model.

### Trust boundaries

The system operates under the following trust assumptions:

- **The server is trusted to serve correct JavaScript.** Because the client-side encryption code runs in the browser and is served by the same server that stores the encrypted data, a compromised server can at any time serve modified JavaScript that exfiltrates the `prfOutput` or `masterKey` from browser memory during a legitimate login session. This is a fundamental limitation of browser-based E2E encryption and is not unique to this application — it applies to all similar web-based E2E encrypted storage systems.
- **The operating system and browser are trusted.** A compromised OS can extract key material from browser memory, intercept WebAuthn API calls, or manipulate the displayed UI.
- **`SYSTEM_ENCRYPTION_KEY` must remain confidential.** Exposure of this environment variable is the single most impactful secret compromise for server-layer-only encrypted files.
- **The authenticator hardware is trusted** to correctly implement PRF/HMAC-secret and not leak private key material.

### What is protected — and what is not

| Data | Protected by | Exposed if |
|------|-------------|-----------|
| File contents (server-only mode) | AES-256-GCM (server layer) | DB + `SYSTEM_ENCRYPTION_KEY` leaked |
| File contents (E2E mode) | AES-256-GCM × 2 layers | DB + `SYSTEM_ENCRYPTION_KEY` + physical authenticator |
| File names, sizes, MIME types | **Nothing — stored in plaintext** | DB leaked |
| Folder structure | **Nothing — stored in plaintext** | DB leaked |
| Upload timestamps | **Nothing — stored in plaintext** | DB leaked |
| Auth mechanism used (`e2e-platform`, etc.) | **Nothing — stored in plaintext** | DB leaked |
| Credential public keys | N/A (public by design) | Always |
| Master key (wrapped) | AES-256-GCM (wrapping key) | DB + physical authenticator |
| Session activity | Server-side session store | Session store compromise |

### Attack vectors and vulnerabilities

#### 1. `SYSTEM_ENCRYPTION_KEY` compromise → all server-only files readable

**Severity: Critical for server-only files.**

The server-side file key is derived deterministically as:

```
fileKey = HKDF-SHA256(SYSTEM_ENCRYPTION_KEY, salt=∅, info="file-encryption:{fileId}:{credentialId}")
```

Both `fileId` and `credentialId` are stored in plaintext in the `files` table. If an attacker obtains `SYSTEM_ENCRYPTION_KEY` (from a leaked `.env` file, Docker config, process environment dump, or insider threat), they can immediately compute `fileKey` for every file in the database and decrypt all server-only encrypted files without any brute force.

**Mitigation:** Treat `SYSTEM_ENCRYPTION_KEY` like a private key — rotate it immediately if exposure is suspected, restrict OS-level access to the environment, use a secrets manager rather than `.env` files in production.

#### 2. Database compromise → plaintext metadata exposed

**Severity: High.**

Even if file contents are protected (especially by E2E), the following fields are stored in plaintext in the SQLite database and are immediately readable to anyone who obtains the database file:

- `users.username`, `users.display_name`
- `files.filename`, `files.mime_type`, `files.size`, `files.folder_path`, `files.uploaded_at`
- `files.auth_mechanisms` (reveals which authenticator type was used)
- `credentials.credential_id`, `credentials.transports`

A database-only compromise exposes the full directory listing, file names, file sizes, and authenticator inventory for all users, even if the file contents themselves remain encrypted.

**Mitigation:** Encrypt the SQLite file at rest (e.g., using an encrypted filesystem or SQLCipher). Consider not storing file names in plaintext if your threat model requires metadata confidentiality.

#### 3. No forward secrecy for the E2E master key

**Severity: Medium.**

All E2E-encrypted files are encrypted with the same persistent `masterKey`. If this key is ever exposed (e.g., via a memory dump during an active browser session, a browser extension with `tabs` permission, or a future vulnerability in the WebCrypto API), every E2E-encrypted file — past and future — is compromised.

There is no mechanism to rotate the master key without re-encrypting all files.

**Mitigation:** Be aware that E2E encryption here provides protection against offline server-data theft, not against a live browser compromise. Avoid using browser extensions with broad permissions on the same browser profile used to access this application.

#### 4. Server controls the client-side encryption code (supply chain attack surface)

**Severity: Medium.**

Because the React application is served by the same server that stores the encrypted files, a sophisticated attacker who controls the server can serve a modified version of the JavaScript bundle that:

- Exfiltrates `prfOutput` before it is consumed by `deriveClientKey`
- Exfiltrates the in-memory `masterKey` (a `CryptoKey` object) after it is unwrapped
- Silently sends plaintext file contents to an attacker-controlled endpoint during upload

This attack requires compromising the server's application code or build pipeline (e.g., a compromised Docker image, npm supply chain attack, or direct code modification). The attack only affects future logins — files already encrypted and stored cannot be retroactively decrypted by this vector without the PRF output.

**Mitigation:** Use [Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) for the frontend bundle (currently not implemented). Pin Docker image digests. Audit dependencies regularly. Monitor for unexpected network requests from the browser.

#### 5. Wrapped key table as a shared compromise surface

**Severity: Medium.**

The `user_wrapped_keys` table stores the master key encrypted under each credential's wrapping key. Because all credentials for a user share the same master key:

- Compromising **any one** of a user's registered authenticators gives access to all E2E-encrypted files (after unwrapping the master key via a WebAuthn ceremony with the compromised authenticator).
- Adding a new authenticator expands the attack surface — each additional credential is a new vector to the same master key.
- A compromised server could serve a modified wrapped key response, causing the client to use an attacker-supplied key for future encryption operations.

**Mitigation:** Minimise the number of registered credentials. Revoke credentials for lost or stolen authenticators immediately. For the highest-security scenarios, use a single hardware security key rather than sharing the key across platform authenticators.

#### 6. Credential ID as non-secret HKDF derivation input

**Severity: Informational.**

The `credentialId` is used as part of the HKDF `info` parameter for server-side file key derivation. In HKDF, `info` is a *public* parameter — its secrecy is not required for security. The security of server-side file keys depends entirely on the secrecy of `SYSTEM_ENCRYPTION_KEY`. Storing `credentialId` in plaintext in the `files` table does not meaningfully weaken security beyond what is already provided by `SYSTEM_ENCRYPTION_KEY`.

#### 7. Session hijacking — server access without client key

**Severity: Low for E2E files, High for server-only files.**

A stolen session cookie grants authenticated API access. For server-only encrypted files, the server decrypts on the fly and the attacker can download all files the session user has access to. For E2E-encrypted files, the session alone is insufficient — the attacker would also need the in-memory `masterKey`, which is never sent to the server.

**Mitigation:** Session cookies are already `httpOnly` and `sameSite: strict`, preventing JavaScript access and CSRF-based theft. Use HTTPS (required by WebAuthn). Consider short session expiry.

#### 8. Platform authenticator compromise requires defeating local authentication

**Severity: Low (hardware-dependent).**

For platform authenticators (Face ID, Touch ID, Windows Hello), the WebAuthn PRF extension is gated behind the device's local user verification (biometric or PIN). An attacker with physical access to the device must also defeat the biometric or guess the PIN to trigger the PRF operation. This provides a meaningful defence-in-depth layer beyond the cryptographic protections.

---

### Threat scenario: Server data fully compromised — can an attacker brute force the data?

This section walks through a concrete scenario where an attacker has obtained a complete copy of the server's data.

**Attacker's initial position:**
- Full copy of `storage.db` (all tables, including `files`, `user_wrapped_keys`, `credentials`)
- `SYSTEM_ENCRYPTION_KEY` (from the environment / `.env` file)
- No physical access to any registered authenticator

#### Step 1 — Strip the server-side encryption layer

For every file in the `files` table the attacker computes:

```
fileKey = HKDF-SHA256(SYSTEM_ENCRYPTION_KEY, info="file-encryption:{id}:{credential_id}")
rawPayload = AES-256-GCM-Decrypt(fileKey, iv, auth_tag, encrypted_data)
```

All inputs (`id`, `credential_id`, `iv`, `auth_tag`, `encrypted_data`) are in the database. `SYSTEM_ENCRYPTION_KEY` is known. This step **requires no brute force** — it is a direct deterministic computation.

**Result after step 1:**
- Server-only encrypted files (`client_encrypted = 0`): **fully decrypted** — the attacker has the raw file content.
- E2E encrypted files (`client_encrypted = 1`): the `rawPayload` starts with the 4-byte magic `SCE1` followed by a 12-byte IV and AES-256-GCM ciphertext. The inner encryption layer remains intact.

#### Step 2 — Attempt to break the E2E layer (inner encryption)

For E2E files, the inner ciphertext is:

```
AES-256-GCM(masterKey, rawFile)
```

where `masterKey` is a 256-bit AES key that was generated in the browser and never sent to the server.

The attacker looks in `user_wrapped_keys` and finds entries of the form:

```
wrapped_key = AES-256-GCM(wrappingKey, raw_master_key_bytes)
```

To recover `raw_master_key_bytes`, the attacker needs `wrappingKey`:

```
wrappingKey = HKDF-SHA256(prfOutput, info="sec-selfstorage-key-wrapping-v1")
```

`prfOutput` is 32 bytes (256 bits) of output from the authenticator's HMAC-secret hardware function. It is **not stored anywhere** — it is produced only when the physical authenticator performs a WebAuthn authentication ceremony. An attacker without the physical hardware cannot compute or guess `prfOutput`.

**Brute-forcing `prfOutput` is not feasible.** The search space is 2^256 (AES-256 key space). Even at 10^18 guesses per second — orders of magnitude faster than any contemporary hardware — exhausting the search space would take approximately 3.7 × 10^57 years.

**Result after step 2:**
- Without the physical authenticator, the attacker is **completely blocked** on all E2E-encrypted files.
- No amount of computational resources can recover `prfOutput` or `masterKey` from the data at rest.

#### Step 3 — Attacker also obtains a physical authenticator

If the attacker additionally steals a registered physical authenticator:

- **Security key (YubiKey, etc.):** The attacker can plug the key into any computer and perform a WebAuthn authentication ceremony against a server they control (using the challenge from `challenges` table or generating their own). The key will produce the deterministic `prfOutput` for the fixed PRF salt. The attacker then derives `wrappingKey`, fetches the `wrapped_key` from the database, and recovers `masterKey`. All E2E files are then decryptable.
- **Platform authenticator (Face ID, Touch ID, Windows Hello):** The attacker must additionally defeat the local user verification (biometric match or PIN). This raises the physical attack bar significantly.

#### Summary

| Attacker capability | Server-only files | E2E files |
|---------------------|-------------------|-----------|
| DB only | ✗ Protected (missing system key) | ✗ Protected (two layers intact) |
| DB + `SYSTEM_ENCRYPTION_KEY` | ✓ **Fully readable (no brute force needed)** | ✗ Protected (inner layer intact) |
| DB + `SYSTEM_ENCRYPTION_KEY` + any registered security key | ✓ Fully readable | ✓ **Fully readable** |
| DB + `SYSTEM_ENCRYPTION_KEY` + platform authenticator (no biometric defeat) | ✓ Fully readable | ✗ Protected (biometric gate) |
| DB + `SYSTEM_ENCRYPTION_KEY` + platform authenticator + biometric/PIN | ✓ Fully readable | ✓ **Fully readable** |

**Key takeaway:** E2E encryption provides meaningful protection against a server-data compromise *as long as the physical authenticator is not also compromised*. For users who store highly sensitive files, using a dedicated hardware security key (not shared, stored securely offline when not in use) provides the strongest protection. For server-only encrypted files, protecting `SYSTEM_ENCRYPTION_KEY` is the only meaningful defence against a database compromise.

## License

MIT

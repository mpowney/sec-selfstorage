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
└─────────────────────────────────────┘
```

### Encryption Architecture

Files are encrypted with a two-layer key derivation scheme:

1. **System key** — A 32-byte AES-256 key stored in the `SYSTEM_ENCRYPTION_KEY` environment variable
2. **YubiKey identity** — The WebAuthn credential ID of the YubiKey used to upload the file

The file encryption key is derived as:
```
fileKey = HKDF-SHA256(systemKey, info="file-encryption:{fileId}:{credentialId}")
```

This means **both** the system key **and** the specific YubiKey credential are required to decrypt any file. A file uploaded with one YubiKey cannot be decrypted with a different YubiKey, even with the same system key.

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
    reverse_proxy localhost:4000
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

## License

MIT

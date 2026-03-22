import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDb } from './database.js';
import authRouter from './auth.js';
import filesRouter from './files.js';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '4000', 10);

// Trust the reverse proxy (Caddy, nginx, etc.) so that req.protocol reflects
// X-Forwarded-Proto and secure session cookies are set correctly.
if (process.env['TRUST_PROXY']) {
  app.set('trust proxy', process.env['TRUST_PROXY']);
} else if (process.env['NODE_ENV'] === 'production') {
  app.set('trust proxy', 1);
}

// Initialize database
getDb();

// Middleware
app.use(cors({
  origin: process.env['RP_ORIGIN'] ?? 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const sessionSecret = process.env['SESSION_SECRET'];
if (!sessionSecret) {
  console.warn('WARNING: SESSION_SECRET env var not set. Using insecure default secret.');
}

app.use(
  session({
    secret: sessionSecret ?? 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env['NODE_ENV'] === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// Request diagnostics — enabled by setting DEBUG_REQUESTS=1 in the environment.
// Logs the headers and session state that are critical for proxy + CSRF debugging.
const debugRequests = process.env['DEBUG_REQUESTS'] === '1';

if (debugRequests) {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const relevant = {
      method: req.method,
      url: req.originalUrl,
      protocol: req.protocol,          // reflects X-Forwarded-Proto when trust proxy is set
      ip: req.ip,                      // reflects X-Forwarded-For when trust proxy is set
      trustProxy: app.get('trust proxy'),
      headers: {
        host: req.headers['host'],
        origin: req.headers['origin'],
        referer: req.headers['referer'],
        cookie: req.headers['cookie'] ? '<present>' : '<absent>',
        'x-csrf-token': req.headers['x-csrf-token'] ?? '<absent>',
        'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? '<absent>',
        'x-forwarded-for': req.headers['x-forwarded-for'] ?? '<absent>',
        'x-forwarded-host': req.headers['x-forwarded-host'] ?? '<absent>',
      },
      session: {
        id: req.session?.id ?? '<none>',
        csrfToken: req.session?.csrfToken ? '<set>' : '<absent>',
        userId: req.session?.userId ?? '<absent>',
      },
    };
    console.debug('[DEBUG]', JSON.stringify(relevant));
    next();
  });
}

// CSRF protection — synchronizer token pattern
// GET /api/csrf-token returns a per-session token; all state-changing requests must
// include it in the X-CSRF-Token header.
function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const safeMethod = /^(GET|HEAD|OPTIONS)$/i.test(req.method);
  if (safeMethod) {
    next();
    return;
  }
  const sessionToken: string | undefined = req.session.csrfToken as string | undefined;
  const headerToken = req.headers['x-csrf-token'];
  if (!sessionToken || !headerToken || headerToken !== sessionToken) {
    console.warn(
      '[CSRF] Rejected %s %s — sessionId=%s sessionToken=%s headerToken=%s protocol=%s x-forwarded-proto=%s',
      req.method, req.originalUrl,
      req.session?.id ?? '<none>',
      sessionToken ? '<set>' : '<absent>',
      headerToken ?? '<absent>',
      req.protocol,
      req.headers['x-forwarded-proto'] ?? '<absent>',
    );
    res.status(403).json({ error: `Invalid CSRF token (${headerToken} !== ${sessionToken})` });
    return;
  }
  next();
}

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const fileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// CSRF token endpoint — frontend fetches this on startup
app.get('/api/csrf-token', (req, res) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString('hex');
  }
  res.json({ csrfToken: req.session.csrfToken });
});

// API routes — CSRF protection applied to all state-changing requests
app.use('/api/auth', authLimiter, csrfProtection, authRouter);
app.use('/api/files', fileLimiter, csrfProtection, filesRouter);

// Serve frontend static files in production
const frontendDist = join(__dirname, '..', '..', 'frontend', 'dist');
if (existsSync(frontendDist)) {
  app.use(staticLimiter, express.static(frontendDist));
  app.get('*', staticLimiter, (_req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`SecSelfStorage backend running on port ${PORT}`);
  console.log(`  RP_ID:       ${process.env['RP_ID'] ?? 'localhost'}`);
  console.log(`  RP_NAME:     ${process.env['RP_NAME'] ?? 'SecSelfStorage'}`);
  console.log(`  RP_ORIGIN:   ${process.env['RP_ORIGIN'] ?? 'http://localhost:3000'}`);
  console.log(`  DATA_DIR:    ${process.env['DATA_DIR'] ?? './data'}`);
  console.log(`  NODE_ENV:    ${process.env['NODE_ENV'] ?? '(unset — cookie.secure=false)'}`);
  console.log(`  TRUST_PROXY: ${process.env['TRUST_PROXY'] ?? '(unset)'}  →  effective trust proxy = ${JSON.stringify(app.get('trust proxy'))}`);
  console.log(`  cookie.secure: ${process.env['NODE_ENV'] === 'production'}`);
  console.log(`  DEBUG_REQUESTS: ${debugRequests ? 'enabled' : 'disabled (set DEBUG_REQUESTS=1 to enable)'}`);
});

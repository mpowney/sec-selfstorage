import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDb } from './database.js';
import authRouter from './auth.js';
import filesRouter from './files.js';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '4000', 10);

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
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/files', filesRouter);

// Serve frontend static files in production
const frontendDist = join(__dirname, '..', '..', 'frontend', 'dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`SecSelfStorage backend running on port ${PORT}`);
  console.log(`  RP_ID:     ${process.env['RP_ID'] ?? 'localhost'}`);
  console.log(`  RP_NAME:   ${process.env['RP_NAME'] ?? 'SecSelfStorage'}`);
  console.log(`  RP_ORIGIN: ${process.env['RP_ORIGIN'] ?? 'http://localhost:3000'}`);
  console.log(`  DATA_DIR:  ${process.env['DATA_DIR'] ?? './data'}`);
});

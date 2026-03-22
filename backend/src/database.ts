import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = process.env['DATA_DIR'] ?? './data';
  const dbPath = `${dataDir}/storage.db`;

  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      credential_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      encrypted_data BLOB NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      folder_path TEXT NOT NULL DEFAULT '',
      client_encrypted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const tableInfo = db.prepare('PRAGMA table_info(files)').all() as Array<{ name: string }>;

  // Migration: add folder_path column to existing databases
  if (!tableInfo.some((col) => col.name === 'folder_path')) {
    db.exec("ALTER TABLE files ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''");
  }

  // Migration: add client_encrypted column to existing databases
  if (!tableInfo.some((col) => col.name === 'client_encrypted')) {
    db.exec('ALTER TABLE files ADD COLUMN client_encrypted INTEGER NOT NULL DEFAULT 0');
  }

  return db;
}

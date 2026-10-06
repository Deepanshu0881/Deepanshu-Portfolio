import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));

export const PATHS = {
  public: path.join(ROOT, 'public'),
  admin: path.join(ROOT, 'admin'),
  seed: path.join(ROOT, 'seed', 'content.json'),
  content: path.join(DATA_DIR, 'content.json'),
  auth: path.join(DATA_DIR, 'auth.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  stats: path.join(DATA_DIR, 'stats.json'),
  initialPassword: path.join(DATA_DIR, 'initial-admin-password.txt'),
  uploads: path.join(DATA_DIR, 'uploads'),
  backups: path.join(DATA_DIR, 'backups'),
};

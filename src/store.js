// File-based persistence: content, messages, backups and uploads all live in DATA_DIR.
// Writes are atomic (temp file + rename) and serialized per file.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PATHS } from './paths.js';
import { sanitizeContent } from './schema.js';

const MAX_BACKUPS = 30;
const MAX_MESSAGES = 1000;
const queues = new Map();

function enqueue(key, task) {
  const run = (queues.get(key) || Promise.resolve()).then(task, task);
  queues.set(key, run.catch(() => {}));
  return run;
}

export async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${file}: ${err.message}`);
  }
}

export function writeJSON(file, data) {
  return enqueue(file, async () => {
    const json = JSON.stringify(data, null, 2);
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, json);
    try {
      await fs.rename(tmp, file);
    } catch {
      // Windows can refuse a rename while another process (e.g. antivirus) holds the file.
      await fs.writeFile(file, json);
      await fs.rm(tmp, { force: true });
    }
  });
}

/* ---------------------------------- content --------------------------------- */

let content;
let messages = [];

export async function initStore() {
  await fs.mkdir(PATHS.uploads, { recursive: true });
  await fs.mkdir(PATHS.backups, { recursive: true });

  const existing = await readJSON(PATHS.content, null);
  if (existing) {
    content = sanitizeContent(existing);
  } else {
    content = sanitizeContent(await readJSON(PATHS.seed, {}));
    content.updatedAt = new Date().toISOString();
    await writeJSON(PATHS.content, content);
  }
  messages = (await readJSON(PATHS.messages, [])).filter(m => m && m.id);
}

export const getContent = () => content;

export async function saveContent(input) {
  const next = sanitizeContent(input);
  next.updatedAt = new Date().toISOString();
  await backupCurrent();
  await writeJSON(PATHS.content, next);
  content = next;
  cleanupUploads().catch(err => console.warn('Upload cleanup failed:', err.message));
  return next;
}

/* ---------------------------------- backups --------------------------------- */

const BACKUP_RE = /^content-[\dTZ-]+\.json$/;

async function backupCurrent() {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.copyFile(PATHS.content, path.join(PATHS.backups, `content-${stamp}.json`));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const all = await listBackups();
  await Promise.all(all.slice(MAX_BACKUPS).map(b => fs.rm(path.join(PATHS.backups, b.name), { force: true })));
}

export async function listBackups() {
  const names = (await fs.readdir(PATHS.backups)).filter(n => BACKUP_RE.test(n)).sort().reverse();
  return Promise.all(names.map(async name => {
    const stat = await fs.stat(path.join(PATHS.backups, name));
    return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
  }));
}

export async function restoreBackup(name) {
  if (!BACKUP_RE.test(name)) throw Object.assign(new Error('Invalid backup name'), { status: 400 });
  const data = await readJSON(path.join(PATHS.backups, name), null);
  if (!data) throw Object.assign(new Error('Backup not found'), { status: 404 });
  return saveContent(data);
}

/* ---------------------------------- uploads --------------------------------- */

const SIGNATURES = {
  jpg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: b => b.subarray(0, 4).toString('hex') === '89504e47',
  gif: b => b.subarray(0, 4).toString('ascii') === 'GIF8',
  webp: b => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  pdf: b => b.subarray(0, 5).toString('ascii') === '%PDF-',
};
export const UPLOAD_TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

export async function saveUpload(buffer, mime) {
  const ext = UPLOAD_TYPES[mime];
  if (!ext || !Buffer.isBuffer(buffer) || !buffer.length || !SIGNATURES[ext](buffer)) {
    throw Object.assign(new Error('Unsupported or corrupt file. Use JPG, PNG, WebP, GIF or PDF.'), { status: 400 });
  }
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(PATHS.uploads, name), buffer);
  return `/uploads/${name}`;
}

// Removes uploads older than a day that are not referenced by the current content or any backup.
async function cleanupUploads() {
  const referenced = new Set();
  const collect = text => { for (const m of text.matchAll(/\/uploads\/([\w.-]+)/g)) referenced.add(m[1]); };
  collect(JSON.stringify(content));
  for (const b of await listBackups()) collect(await fs.readFile(path.join(PATHS.backups, b.name), 'utf8'));

  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const name of await fs.readdir(PATHS.uploads)) {
    if (referenced.has(name)) continue;
    const file = path.join(PATHS.uploads, name);
    const stat = await fs.stat(file);
    if (stat.isFile() && stat.mtimeMs < dayAgo) await fs.rm(file, { force: true });
  }
}

/* --------------------------------- messages --------------------------------- */

export const listMessages = () => messages;

export async function addMessage({ name, email, message }) {
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    name, email, message,
    read: false,
    createdAt: new Date().toISOString(),
  };
  messages = [entry, ...messages].slice(0, MAX_MESSAGES);
  await writeJSON(PATHS.messages, messages);
  return entry;
}

export async function updateMessage(id, patch) {
  const msg = messages.find(m => m.id === id);
  if (!msg) return null;
  if (typeof patch.read === 'boolean') msg.read = patch.read;
  await writeJSON(PATHS.messages, messages);
  return msg;
}

export async function deleteMessage(id) {
  const before = messages.length;
  messages = messages.filter(m => m.id !== id);
  if (messages.length !== before) await writeJSON(PATHS.messages, messages);
  return messages.length !== before;
}

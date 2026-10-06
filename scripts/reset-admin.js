// Emergency recovery: generates a new admin password, disables 2FA and signs out every session.
// Usage: npm run reset-admin
import '../src/env.js';
import fs from 'node:fs/promises';
import { PATHS } from '../src/paths.js';
import { generatePassword, resetAuth } from '../src/auth.js';

const password = generatePassword();
await fs.mkdir(PATHS.uploads, { recursive: true });
await resetAuth(password, { mustChangePassword: true });
await fs.writeFile(PATHS.initialPassword,
  `Admin password reset on ${new Date().toISOString()}.\nNew password (change it in Dashboard → Security):\n\n${password}\n`);

console.log(`
  Admin access has been reset.
  New password: ${password}
  (also saved to data/initial-admin-password.txt)

  Two-factor authentication is now off and all sessions were signed out.
  If the server is running, restart it so it picks up the new credentials.
`);

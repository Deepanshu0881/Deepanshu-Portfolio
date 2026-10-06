// Loads .env before any other module reads process.env. Must be the first import in server.js.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch {
  // No .env file — defaults apply.
}

#!/usr/bin/env node
/**
 * Print the /api/v1 feed key for a licensee.
 *
 *   node scripts/print-licensee-key.mjs demo
 *
 * The key is the first 24 hex characters of sha256(`${CRON_SECRET}:licensee:<id>`),
 * the same derivation as licenseeKey() in src/lib/licensee-feed.ts. CRON_SECRET
 * is read from .env.local, so the printed key is valid wherever that same
 * CRON_SECRET is deployed. The licensee id must exist in src/lib/licensees.ts
 * or the key authenticates nothing.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = [resolve(__dirname, '../.env.local'), resolve(process.cwd(), '.env.local')].find((p) => existsSync(p));
if (envPath) dotenv.config({ path: envPath, quiet: true });

const licenseeId = process.argv[2];
if (!licenseeId) {
  console.error('Usage: node scripts/print-licensee-key.mjs <licenseeId>');
  process.exit(1);
}

const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error('CRON_SECRET is not set (looked for .env.local next to scripts/ and in the current directory).');
  process.exit(1);
}

// Warn, do not fail, when the id is not in the config: a key can be printed
// ahead of the config change that grants it editions.
const config = readFileSync(resolve(__dirname, '../src/lib/licensees.ts'), 'utf8');
if (!new RegExp(`^\\s*['"]?${licenseeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*:\\s*\\{`, 'm').test(config)) {
  console.error(`Warning: "${licenseeId}" is not a licensee in src/lib/licensees.ts yet; this key reads nothing until it is.`);
}

console.log(createHash('sha256').update(`${secret}:licensee:${licenseeId}`).digest('hex').slice(0, 24));

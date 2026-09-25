#!/usr/bin/env node
/**
 * Print the editor desk key (and the desk URL) for a licensee group.
 *
 *   node scripts/print-editor-key.mjs gedi
 *
 * The key is the first 24 hex characters of sha256(`${CRON_SECRET}:editor:<group>`),
 * the same derivation as editorKey() in src/lib/editor-desk.ts. CRON_SECRET is
 * read from .env.local, so the key is valid wherever that same CRON_SECRET is
 * deployed. The group must be a licensee in src/lib/licensees.ts with
 * requireApproval: true, or the desk returns 404 whatever the key.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = [resolve(__dirname, '../.env.local'), resolve(process.cwd(), '.env.local')].find((p) => existsSync(p));
if (envPath) dotenv.config({ path: envPath, quiet: true });

const group = process.argv[2];
if (!group) {
  console.error('Usage: node scripts/print-editor-key.mjs <group>');
  process.exit(1);
}

const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error('CRON_SECRET is not set (looked for .env.local next to scripts/ and in the current directory).');
  process.exit(1);
}

// Warn, do not fail: a key can be printed ahead of the config change.
const config = readFileSync(resolve(__dirname, '../src/lib/licensees.ts'), 'utf8');
const escaped = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const block = config.match(new RegExp(`^\\s*['"]?${escaped}['"]?\\s*:\\s*\\{([\\s\\S]*?)^\\s*\\},?\\s*$`, 'm'));
if (!block) {
  console.error(`Warning: "${group}" is not a licensee in src/lib/licensees.ts yet; the desk will 404 until it is.`);
} else if (!/requireApproval:\s*true/.test(block[1])) {
  console.error(`Warning: "${group}" does not have requireApproval: true in src/lib/licensees.ts; the desk will 404 until it does.`);
}

const key = createHash('sha256').update(`${secret}:editor:${group}`).digest('hex').slice(0, 24);
console.log(key);
console.error(`https://readflaneur.com/editor/${group}?key=${key}`);

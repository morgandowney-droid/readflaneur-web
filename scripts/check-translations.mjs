#!/usr/bin/env node
/**
 * Translation Sync Checker
 *
 * Checks that all languages in translations.ts have the same keys as English.
 * Run after editing English strings to find which languages need updating.
 *
 * Usage:
 *   node scripts/check-translations.mjs           # Check for missing keys
 *   node scripts/check-translations.mjs --verbose  # Also show extra keys
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '../src/lib/translations.ts');
const content = readFileSync(filePath, 'utf-8');
const verbose = process.argv.includes('--verbose');

// Parse the translation keys per language by extracting quoted keys
const languages = ['en', 'sv', 'fr', 'de', 'es', 'pt', 'it', 'zh', 'ja'];
const keysByLang = {};

for (const lang of languages) {
  // Find the language block
  const blockRegex = new RegExp(`\\b${lang}:\\s*\\{([^}]+(?:\\{[^}]*\\}[^}]*)*)\\}`, 'gs');
  // Simpler approach: find all 'key.subkey': between lang: { and the next },
  const startMarker = `  ${lang}: {`;
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    console.error(`Could not find block for language: ${lang}`);
    continue;
  }

  // Find matching closing brace (track depth)
  let depth = 0;
  let endIdx = startIdx;
  let foundStart = false;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') {
      depth++;
      foundStart = true;
    } else if (content[i] === '}') {
      depth--;
      if (foundStart && depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  const block = content.substring(startIdx, endIdx);
  const keyRegex = /'([a-zA-Z0-9_.]+)':/g;
  const keys = new Set();
  let match;
  while ((match = keyRegex.exec(block)) !== null) {
    keys.add(match[1]);
  }
  keysByLang[lang] = keys;
}

const enKeys = keysByLang['en'];
if (!enKeys) {
  console.error('Could not parse English keys');
  process.exit(1);
}

console.log(`English has ${enKeys.size} keys\n`);

let hasIssues = false;

for (const lang of languages.slice(1)) {
  const langKeys = keysByLang[lang];
  if (!langKeys) continue;

  const missing = [...enKeys].filter(k => !langKeys.has(k));
  const extra = [...langKeys].filter(k => !enKeys.has(k));

  if (missing.length > 0) {
    hasIssues = true;
    console.log(`${lang}: MISSING ${missing.length} keys:`);
    for (const k of missing) {
      console.log(`  - ${k}`);
    }
    console.log();
  }

  if (extra.length > 0 && verbose) {
    console.log(`${lang}: ${extra.length} EXTRA keys (not in English):`);
    for (const k of extra) {
      console.log(`  + ${k}`);
    }
    console.log();
  }

  if (missing.length === 0 && (extra.length === 0 || !verbose)) {
    console.log(`${lang}: OK (${langKeys.size} keys)`);
  }
}

if (!hasIssues) {
  console.log('\nAll languages are in sync with English.');
} else {
  console.log('\nSome languages have missing translations. Add them to translations.ts.');
  process.exit(1);
}

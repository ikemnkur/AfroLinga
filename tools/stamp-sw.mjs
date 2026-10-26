#!/usr/bin/env node
// Sets VERSION in sw.js to a hash of every precached file, so installed apps
// update automatically whenever any app file changes. Run before deploying
// (npm run stamp); the dev server (tools/serve.mjs) runs it on start.

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function stampServiceWorker({ quiet = false } = {}) {
  const swPath = path.join(ROOT, 'sw.js');
  const sw = await readFile(swPath, 'utf8');
  const list = sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1];
  if (!list) throw new Error('Could not find the SHELL list in sw.js');
  const files = [...list.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update(await readFile(path.join(ROOT, f)));
  }
  const version = `v-${hash.digest('hex').slice(0, 10)}`;
  const next = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
  if (next !== sw) {
    await writeFile(swPath, next);
    if (!quiet) console.log(`sw.js VERSION → ${version}`);
  } else if (!quiet) console.log(`sw.js VERSION unchanged (${version})`);
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await stampServiceWorker();

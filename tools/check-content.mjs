#!/usr/bin/env node
// Validates the content + link files and reports which asset files still need to be created.
//
//   node tools/check-content.mjs            summary
//   node tools/check-content.mjs --missing  also list every missing asset file
//
// Exit code 1 if there are errors (broken ids/links/JSON). Missing assets are only reported.

import { readFile, readdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const listMissing = process.argv.includes('--missing');
const errors = [];
const warnings = [];

async function json(rel) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));
  } catch (err) {
    errors.push(`${rel}: ${err.message}`);
    return null;
  }
}

const languages = await json('data/languages.json');
const dictionary = await json('data/dictionary.json');
const phrases = await json('data/phrases.json');
const numbers = await json('data/numbers.json');
const audioMap = await json('data/audio-map.json');
const imageMap = await json('data/image-map.json');
const imageAudio = await json('data/image-audio-map.json');
if (errors.length) finish();

const codes = languages.languages.map(l => l.code);
const ids = new Map();
const untranslated = Object.fromEntries(codes.map(c => [c, []]));
const register = (item, file) => {
  if (!item.id) return errors.push(`${file}: entry without id (${JSON.stringify(item).slice(0, 60)})`);
  if (ids.has(item.id)) errors.push(`duplicate id "${item.id}" in ${file} (also in ${ids.get(item.id)})`);
  ids.set(item.id, file);
  if (!item.en) errors.push(`${item.id}: missing English ("en")`);
  for (const c of codes) if (!item[c]) untranslated[c].push(item.id);
};

const categoryIds = new Set([...(dictionary.categories || []), ...(phrases.categories || [])].map(c => c.id));
for (const w of dictionary.words) {
  register(w, 'dictionary.json');
  if (w.category && !categoryIds.has(w.category)) warnings.push(`${w.id}: unknown category "${w.category}"`);
  for (const x of w.examples || []) register(x, 'dictionary.json (example)');
}
for (const p of phrases.phrases) register(p, 'phrases.json');
for (const n of numbers.numbers) {
  register(n, 'numbers.json');
  if (!Number.isInteger(n.value)) errors.push(`${n.id}: "value" must be an integer`);
}
for (const [c, list] of Object.entries(untranslated)) {
  if (list.length) warnings.push(`${list.length} items have no ${c} translation (they only appear when learning the other language)${listMissing ? `: ${list.join(', ')}` : ''}`);
}

// Link files must point at real ids.
const audioIds = new Set();
const assets = []; // { kind, rel }
for (const [name, f] of Object.entries(audioMap.sfx || {})) if (f) assets.push({ kind: `sfx`, rel: audioMap.basePath + f, label: name });
for (const e of audioMap.entries) {
  if (!ids.has(e.id)) errors.push(`audio-map.json: unknown text id "${e.id}"`);
  audioIds.add(e.id);
  for (const [lang, f] of Object.entries(e.files || {})) if (f) assets.push({ kind: `audio/${lang}`, rel: audioMap.basePath + f, label: e.id });
}
const imageIds = new Set();
for (const e of imageMap.entries) {
  if (imageIds.has(e.id)) errors.push(`image-map.json: duplicate image id "${e.id}"`);
  imageIds.add(e.id);
  for (const t of e.textIds || []) if (!ids.has(t)) errors.push(`image-map.json: ${e.id} links unknown text id "${t}"`);
  if (e.file) assets.push({ kind: 'image', rel: imageMap.basePath + e.file, label: e.id });
}
for (const e of imageAudio.entries) {
  if (!imageIds.has(e.imageId)) errors.push(`image-audio-map.json: unknown imageId "${e.imageId}"`);
  for (const a of e.audioIds || []) if (!audioIds.has(a)) errors.push(`image-audio-map.json: ${e.imageId} links unknown audio id "${a}"`);
}

// Items without links (run tools/scaffold-links.mjs to add them).
const unlinkedAudio = [...ids.keys()].filter(id => !audioIds.has(id));
if (unlinkedAudio.length) warnings.push(`${unlinkedAudio.length} items have no audio-map entry (run: npm run scaffold)`);

// Service worker must precache every app file, or the app breaks offline.
const sw = await readFile(path.join(ROOT, 'sw.js'), 'utf8');
const walk = async dir => (await readdir(path.join(ROOT, dir), { withFileTypes: true })).flatMap(d => (d.isDirectory() ? [] : [`${dir}/${d.name}`]));
const shellFiles = [...(await walk('js')), ...(await walk('js/games')), ...(await walk('css')), ...(await walk('data')), ...(await walk('icons'))]
  .filter(f => /\.(js|css|json|svg|png|webmanifest)$/.test(f)); // source lists like data/*.txt aren't loaded by the app
for (const f of shellFiles) if (!sw.includes(`'${f}'`)) errors.push(`sw.js SHELL is missing '${f}' (the app would break offline)`);

// Asset status. Empty (0-byte) files are placeholders, so they count as missing.
const hasContent = rel => (statSync(path.join(ROOT, rel), { throwIfNoEntry: false })?.size ?? 0) > 0;
const byKind = {};
const missing = [];
for (const a of assets) {
  const k = (byKind[a.kind] ||= { have: 0, total: 0 });
  k.total++;
  if (hasContent(a.rel)) k.have++;
  else missing.push(a);
}

console.log('AfroLinga content check\n');
console.log(`Words: ${dictionary.words.length}  Examples: ${dictionary.words.flatMap(w => w.examples || []).length}  Phrases: ${phrases.phrases.length}  Numbers: ${numbers.numbers.length}`);
console.log('\nAssets present:');
for (const [k, v] of Object.entries(byKind).sort()) console.log(`  ${k.padEnd(10)} ${String(v.have).padStart(4)} / ${v.total}`);
if (listMissing && missing.length) {
  console.log('\nMissing asset files:');
  for (const m of missing) console.log(`  ${m.rel}  (${m.label})`);
} else if (missing.length) {
  console.log(`\n${missing.length} asset files not created yet (use --missing to list them).`);
}
finish();

function finish() {
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✖ ${e}`);
    process.exit(1);
  }
  console.log('\n✔ No errors.');
  process.exit(0);
}

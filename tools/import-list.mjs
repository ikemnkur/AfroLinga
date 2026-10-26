#!/usr/bin/env node
// Imports word/phrase lists written as:   english ---> igbo ---> yoruba
//
//   node tools/import-list.mjs <file> --type=phrase|word [--section="commands"] [--category=commands]
//                              [--columns=en,ig,yo] [--dry-run]
//
// - Lines ending in ":" (e.g. "commands:") are section headers. --section imports only that section.
//   Without --category the section name becomes the category.
// - "a / b" (spaced slash) → "a" is the answer, "b" is an accepted alternative.
// - "(…)" notes are moved to "notes"; unspaced slashes ("me/them") are imported as-is but reported for review.
// - Entries whose English already exists (in the dictionary or phrases) are skipped.
// Afterwards run: npm run scaffold && npm run check

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const [file, ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map(a => a.replace(/^--/, '').split('=')).map(([k, ...v]) => [k, v.join('=') || true]));
if (!file || !['phrase', 'word'].includes(opts.type)) {
  console.error('Usage: node tools/import-list.mjs <file> --type=phrase|word [--section=name] [--category=id] [--columns=en,ig,yo] [--dry-run]');
  process.exit(1);
}

const columns = (opts.columns || 'en,ig,yo').split(',');
const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const titleCase = s => s.replace(/(^|\s)\S/g, m => m.toUpperCase());
const capitalizeFirst = s => s.replace(/^\p{L}/u, m => m.toUpperCase());
const isHeader = line => !line.includes('--->') && /:\s*$/.test(line);

/** "take it from me/them" → ["take it from me", "take it from them"] (each "a/b" word alternates). */
function expandSlashes(text) {
  return text.split(' ').reduce(
    (acc, word) => acc.flatMap(prefix => word.split('/').map(w => (prefix ? `${prefix} ${w}` : w))),
    [''],
  );
}

const dictPath = path.join(DATA, 'dictionary.json');
const phrasePath = path.join(DATA, 'phrases.json');
const dictionary = JSON.parse(await readFile(dictPath, 'utf8'));
const phrases = JSON.parse(await readFile(phrasePath, 'utf8'));
const target = opts.type === 'word' ? dictionary : phrases;
const listKey = opts.type === 'word' ? 'words' : 'phrases';
const prefix = opts.type === 'word' ? 'w_' : 'p_';

const existingEn = new Map(
  [...dictionary.words, ...phrases.phrases].flatMap(i => [i.en, i.importedAs].filter(Boolean).map(en => [en.toLowerCase().replace(/[.?!]+$/, ''), i.id])),
);
const ids = new Set([...dictionary.words, ...dictionary.words.flatMap(w => w.examples || []), ...phrases.phrases].map(i => i.id));
const review = [];
const skipped = [];
const added = [];

function clean(raw, lang, en) {
  let s = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  let notes = null;
  s = s.replace(/\s*\(([^)]*)\)\s*/g, (_, n) => {
    notes = n.trim();
    return ' ';
  }).trim();
  s = s.replace(/\s*—\s*/g, ' — ').replace(/[,.;]+$/, '').trim();
  const [main, ...alts] = s.split(/\s+\/\s+/).map(x => x.replace(/[,.;]+$/, '').trim()).filter(Boolean);
  if (notes) review.push(`${en} [${lang}]: note "(${notes})" moved to "notes"`);
  if (main && /\S\/\S/.test(main)) review.push(`${en} [${lang}]: "${main}" combines options with "/" – consider splitting into separate entries`);
  return { main, alts, notes };
}

const text = await readFile(file, 'utf8');
let section = null;
for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  if (isHeader(line)) {
    section = line.replace(/:\s*$/, '').trim();
    continue;
  }
  if (/^-{2,}.*-{2,}$/.test(line)) {
    section = line.replace(/-/g, '').trim();
    continue;
  }
  if (!line.includes('--->')) continue;
  if (opts.section && section?.toLowerCase() !== String(opts.section).toLowerCase()) continue;

  const cells = line.split('--->').map(c => c.trim());
  const record = Object.fromEntries(columns.map((c, i) => [c, cells[i] || '']));
  if (!record.en) continue;
  const en = record.en.replace(/[,.;]+$/, '').trim();
  const key = en.toLowerCase().replace(/[.?!]+$/, '');
  // "take it from me/them" counts as existing once "take it from me" and "take it from them" exist.
  const variants = key.includes('/') ? expandSlashes(key) : [key];
  if (variants.every(v => existingEn.has(v)) || existingEn.has(key)) {
    skipped.push(`${en} (already exists as ${[...new Set(variants.map(v => existingEn.get(v)))].join(', ') || existingEn.get(key)})`);
    continue;
  }

  const category = opts.category || slug(section || 'imported');
  const entry = { id: '', en: opts.type === 'phrase' ? capitalizeFirst(en) : en };
  const alt = {};
  const notes = {};
  for (const lang of columns.filter(c => c !== 'en')) {
    if (!record[lang]) continue;
    const { main, alts, notes: n } = clean(record[lang], lang, en);
    if (!main) continue;
    entry[lang] = opts.type === 'phrase' ? capitalizeFirst(main) : main;
    if (alts.length) alt[lang] = alts;
    if (n) notes[lang] = n;
  }
  if (columns.filter(c => c !== 'en').every(lang => !entry[lang])) continue;
  let id = prefix + slug(en);
  for (let n = 2; ids.has(id); n++) id = `${prefix}${slug(en)}_${n}`;
  entry.id = id;
  entry.category = category;
  if (Object.keys(alt).length) entry.alt = alt;
  if (Object.keys(notes).length) entry.notes = notes;
  ids.add(id);
  existingEn.set(key, id);
  target[listKey].push(entry);
  added.push(entry);

  if (!(target.categories || []).some(c => c.id === category)) {
    (target.categories ||= []).push({ id: category, en: titleCase(category.replace(/_/g, ' ')), emoji: '🗂️' });
    review.push(`new category "${category}" added to ${path.basename(opts.type === 'word' ? dictPath : phrasePath)} – give it a nicer name/emoji if you like`);
  }
}

/** One entry per line keeps large content files easy to scan and diff. */
function format(doc) {
  const keys = Object.keys(doc);
  const out = ['{'];
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? ',' : '';
    const v = doc[k];
    if (Array.isArray(v)) {
      out.push(`  ${JSON.stringify(k)}: [`);
      v.forEach((e, j) => out.push(`    ${JSON.stringify(e, null, 1).replace(/\n\s*/g, ' ')}${j < v.length - 1 ? ',' : ''}`));
      out.push(`  ]${comma}`);
    } else {
      out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
    }
  });
  out.push('}');
  return out.join('\n') + '\n';
}

if (!opts['dry-run'] && added.length) await writeFile(opts.type === 'word' ? dictPath : phrasePath, format(target), 'utf8');

console.log(`${opts['dry-run'] ? '[dry run] ' : ''}Added ${added.length} ${listKey}${opts.section ? ` from section "${opts.section}"` : ''}.`);
for (const e of added) console.log(`  + ${e.id}: ${e.en}`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} duplicates:`);
  for (const s of skipped) console.log(`  = ${s}`);
}
if (review.length) {
  console.log('Please review:');
  for (const r of review) console.log(`  ⚠ ${r}`);
}

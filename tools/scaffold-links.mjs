#!/usr/bin/env node
// Adds missing entries to the three link files from the content files.
// Existing entries (and any custom paths you typed) are never overwritten.
//
//   node tools/scaffold-links.mjs [--audio-ext=mp3] [--image-ext=webp]

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const AUDIO_EXT = args['audio-ext'] || 'mp3';
const IMAGE_EXT = args['image-ext'] || 'webp';

const readJson = async f => JSON.parse(await readFile(path.join(DATA, f), 'utf8'));
const readOr = async (f, fallback) => (existsSync(path.join(DATA, f)) ? readJson(f) : fallback);
const writeJson = (f, obj) => writeFile(path.join(DATA, f), JSON.stringify(obj, null, 2) + '\n', 'utf8');

const languages = await readJson('languages.json');
const dictionary = await readJson('dictionary.json');
const phrases = await readJson('phrases.json');
const numbers = await readJson('numbers.json');
const langCodes = [...languages.languages.map(l => l.code), languages.base.code];

// id prefix -> folder name
const FOLDERS = { w: 'words', p: 'phrases', n: 'numbers', x: 'examples' };
const stem = id => id.replace(/^[a-z]+_/, '');
const folderOf = id => FOLDERS[id.split('_')[0]] || 'other';

const items = [
  ...dictionary.words,
  ...dictionary.words.flatMap(w => w.examples || []),
  ...phrases.phrases,
  ...numbers.numbers,
];

// ---- audio-map.json (sounds <-> text) ----
const audioMap = await readOr('audio-map.json', {
  _about: '',
  basePath: 'assets/audio/',
  sfx: {},
  entries: [],
});
audioMap._about =
  "Links text items (by id) to recorded audio per language. Paths are relative to basePath. Delete a path or leave it empty if a recording doesn't exist; the app falls back to device speech or text. 'sfx' are game sound effects; if a file is missing a built-in synthesized sound is used.";
audioMap.sfx = {
  correct: 'sfx/correct.mp3',
  incorrect: 'sfx/incorrect.mp3',
  complete: 'sfx/complete.mp3',
  match: 'sfx/match.mp3',
  flip: 'sfx/flip.mp3',
  tap: 'sfx/tap.mp3',
  skip: 'sfx/skip.mp3',
  ...audioMap.sfx,
};
const audioById = new Map(audioMap.entries.map(e => [e.id, e]));
let addedAudio = 0;
for (const item of items) {
  let entry = audioById.get(item.id);
  if (!entry) {
    entry = { id: item.id, files: {} };
    audioMap.entries.push(entry);
    audioById.set(item.id, entry);
    addedAudio++;
  }
  entry.files ||= {};
  for (const code of langCodes) {
    if (!(code in entry.files) && item[code]) {
      entry.files[code] = `${code}/${folderOf(item.id)}/${stem(item.id)}.${AUDIO_EXT}`;
    }
  }
}

// ---- image-map.json (images <-> text) ----
const imageMap = await readOr('image-map.json', { _about: '', basePath: 'assets/images/', entries: [] });
imageMap._about =
  "Links images to text items. One image can illustrate several items (textIds may contain word, phrase or example ids). 'placeholder' is an emoji shown until the image file exists. Paths are relative to basePath.";
const imageById = new Map(imageMap.entries.map(e => [e.id, e]));
const imagedText = new Set(imageMap.entries.flatMap(e => e.textIds || []));
let addedImages = 0;
for (const item of [...dictionary.words, ...phrases.phrases]) {
  if ((item.image === false && !item.id.startsWith('w_')) || imagedText.has(item.id)) continue;
  const id = `img_${stem(item.id)}${item.id.startsWith('p_') ? '_phrase' : ''}`;
  if (imageById.has(id)) continue;
  const entry = {
    id,
    file: `${folderOf(item.id)}/${stem(item.id)}.${IMAGE_EXT}`,
    textIds: [item.id],
    placeholder: item.emoji || '🖼️',
  };
  imageMap.entries.push(entry);
  imageById.set(id, entry);
  imagedText.add(item.id);
  addedImages++;
}

// ---- image-audio-map.json (images <-> sounds) ----
const imageAudio = await readOr('image-audio-map.json', { _about: '', entries: [] });
imageAudio._about =
  "Links images to sounds for 'listen and pick the picture' exercises. audioIds reference entry ids in audio-map.json (the first one is the main sound; the language is chosen at play time).";
const linked = new Set(imageAudio.entries.map(e => e.imageId));
let addedLinks = 0;
for (const img of imageMap.entries) {
  if (linked.has(img.id)) continue;
  const audioIds = (img.textIds || []).filter(id => audioById.has(id));
  if (!audioIds.length) continue;
  imageAudio.entries.push({ imageId: img.id, audioIds });
  addedLinks++;
}

await writeJson('audio-map.json', { _about: audioMap._about, basePath: audioMap.basePath, sfx: audioMap.sfx, entries: audioMap.entries });
await writeJson('image-map.json', { _about: imageMap._about, basePath: imageMap.basePath, entries: imageMap.entries });
await writeJson('image-audio-map.json', { _about: imageAudio._about, entries: imageAudio.entries });

console.log(`audio-map.json:       +${addedAudio} entries (${audioMap.entries.length} total)`);
console.log(`image-map.json:       +${addedImages} entries (${imageMap.entries.length} total)`);
console.log(`image-audio-map.json: +${addedLinks} entries (${imageAudio.entries.length} total)`);

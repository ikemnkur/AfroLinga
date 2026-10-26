// Loads every JSON data file and builds lookup indexes.
import { tokenize, stripMarks, normalize } from './util.js';

export const DATA_FILES = {
  languages: 'data/languages.json',
  dictionary: 'data/dictionary.json',
  phrases: 'data/phrases.json',
  numbers: 'data/numbers.json',
  audioMap: 'data/audio-map.json',
  imageMap: 'data/image-map.json',
  imageAudioMap: 'data/image-audio-map.json',
};

export const db = {
  base: null,
  languages: [],
  categories: [],
  words: [],
  phrases: [],
  examples: [],
  numbers: [],
  items: new Map(),
  audio: new Map(),
  sfx: {},
  images: new Map(),
  imageByText: new Map(),
  imageAudio: [],
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  try {
    return toNFC(await res.json());
  } catch (err) {
    throw new Error(`${url} is not valid JSON: ${err.message}`);
  }
}

// Different keyboards produce composed or decomposed accents (ẹ̀ vs e+◌̣+◌̀); unify them.
function toNFC(value) {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(toNFC);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toNFC(v)]));
  return value;
}

export async function loadData() {
  const raw = Object.fromEntries(
    await Promise.all(Object.entries(DATA_FILES).map(async ([key, url]) => [key, await fetchJson(url)])),
  );

  db.base = raw.languages.base;
  db.languages = raw.languages.languages;
  db.categories = [...(raw.dictionary.categories || []), ...(raw.phrases.categories || [])];

  db.words = raw.dictionary.words.map(w => ({ ...w, type: 'word' }));
  db.examples = db.words.flatMap(w =>
    (w.examples || []).map((x, i) => ({ ...x, id: x.id || `${w.id}#${i}`, type: 'example', wordId: w.id })),
  );
  db.phrases = raw.phrases.phrases.map(p => ({ ...p, type: 'phrase' }));
  db.numbers = raw.numbers.numbers.map(n => ({ ...n, id: n.id || `n_${n.value}`, type: 'number' }));

  db.items = new Map();
  for (const item of [...db.words, ...db.examples, ...db.phrases, ...db.numbers]) {
    if (db.items.has(item.id)) console.warn(`[AfroLinga] duplicate id "${item.id}"`);
    db.items.set(item.id, item);
  }

  const audioBase = raw.audioMap.basePath || '';
  db.sfx = Object.fromEntries(Object.entries(raw.audioMap.sfx || {}).map(([k, f]) => [k, f ? audioBase + f : null]));
  db.audio = new Map(
    (raw.audioMap.entries || []).map(e => [
      e.id,
      Object.fromEntries(Object.entries(e.files || {}).filter(([, f]) => f).map(([lang, f]) => [lang, audioBase + f])),
    ]),
  );

  const imageBase = raw.imageMap.basePath || '';
  db.images = new Map();
  db.imageByText = new Map();
  for (const e of raw.imageMap.entries || []) {
    const img = { id: e.id, src: e.file ? imageBase + e.file : null, textIds: e.textIds || [], placeholder: e.placeholder };
    db.images.set(img.id, img);
    for (const t of img.textIds) {
      if (db.items.get(t)?.image !== false && !db.imageByText.has(t)) db.imageByText.set(t, img);
    }
  }

  db.imageAudio = (raw.imageAudioMap.entries || [])
    .map(e => ({ ...e, audioIds: (e.audioIds || []).filter(id => db.items.get(id)?.image !== false) }))
    .filter(e => db.images.has(e.imageId) && e.audioIds.length)
    .map(e => ({ image: db.images.get(e.imageId), audioIds: e.audioIds }));
}

export const getItem = id => db.items.get(id);
export const langInfo = code => (code === db.base?.code ? db.base : db.languages.find(l => l.code === code));

/** All accepted spellings of an item in a language. */
export const acceptedAnswers = (item, lang) => [item[lang], ...(item.alt?.[lang] || [])].filter(Boolean);

export const tokensOf = (item, lang) => item.tokens?.[lang] || tokenize(item[lang]);

export const audioSrc = (id, lang) => db.audio.get(id)?.[lang] || null;

/** Image for a text item: its own image, or for examples the image of the parent word. */
export function imageFor(item) {
  if (!item || item.image === false) return null;
  return db.imageByText.get(item.id) || (item.wordId ? db.imageByText.get(item.wordId) : null) || null;
}

/** What an image looks like on screen (file or placeholder), so two lookalike options are never offered together. */
export const visualKey = image => image?.src || image?.placeholder || image?.id || null;

export const categoryOf = item => db.categories.find(c => c.id === item?.category) || null;

const hasLang = lang => item => Boolean(item[lang] && item.en);
export const wordsFor = lang => db.words.filter(hasLang(lang));
export const phrasesFor = lang => db.phrases.filter(hasLang(lang));
export const numbersFor = lang => db.numbers.filter(hasLang(lang));
export const sentencesFor = lang => [...db.phrases, ...db.examples].filter(hasLang(lang));

/**
 * Pick `n` distractors for `target` from `pool`, preferring the same category,
 * and never repeating the target's text in `lang`.
 */
export function distractors(target, pool, n, lang) {
  const seen = new Set([stripMarks(target[lang])]);
  const out = [];
  const tryAdd = list => {
    for (const item of list) {
      if (out.length >= n) return;
      const key = stripMarks(item[lang]);
      if (item.id === target.id || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  };
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  tryAdd(shuffled.filter(i => i.category && i.category === target.category));
  tryAdd(shuffled);
  return out;
}

/**
 * Find sentences (phrases + example sentences) that contain a dictionary word
 * (exact match, ignoring case), so the word can be blanked out for "fill in the phrase" exercises.
 */
export function fillCandidates(lang) {
  const words = wordsFor(lang).map(w => ({ word: w, tokens: tokenize(w[lang]).map(normalize) }));
  const out = [];
  for (const sentence of sentencesFor(lang)) {
    const sTokens = tokensOf(sentence, lang);
    const exact = sTokens.map(normalize);
    for (const { word, tokens } of words) {
      for (let i = 0; i + tokens.length <= exact.length; i++) {
        if (tokens.every((t, k) => exact[i + k] === t)) {
          out.push({ id: `${sentence.id}:${word.id}`, sentence, word, tokens: sTokens, start: i, length: tokens.length });
          break;
        }
      }
    }
  }
  return out;
}

/** Every asset URL referenced by the link files (used for offline download + asset status). */
export function allAssetUrls() {
  const urls = new Set();
  for (const f of Object.values(db.sfx)) if (f) urls.add(f);
  for (const files of db.audio.values()) for (const f of Object.values(files)) urls.add(f);
  for (const img of db.images.values()) if (img.src) urls.add(img.src);
  return [...urls];
}

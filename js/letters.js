// Letter-level helpers for word games (crossword, hangman, unscramble, word search).
// Works on grapheme clusters so "ẹ̀" (e + dot below + grave) is ONE letter.
// Tone marks (grave/acute/macron/…) are ignored when deciding which letter it is;
// under-dots and ṅ's dot are kept because they make different letters.
import { langInfo, wordsFor } from './data.js';

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const TONE_MARKS = /[\u0300\u0301\u0302\u0304\u030C]/g;

export function graphemes(text) {
  const s = String(text || '').normalize('NFC');
  return segmenter ? [...segmenter.segment(s)].map(x => x.segment) : s.match(/\P{M}\p{M}*/gu) || [];
}

/** Base letter of a grapheme: lower-case, tone marks removed (ẹ̀ → ẹ, Ó → o, ṅ stays ṅ). */
export const letterKey = g => g.normalize('NFD').replace(TONE_MARKS, '').normalize('NFC').toLowerCase();

export const isLetter = g => /\p{L}/u.test(g);

/** Lower-case graphemes of a single word. */
export const cellsOf = text => graphemes(String(text).toLowerCase());

/** True for single words made only of letters (no spaces, hyphens or apostrophes). */
export const isPlainWord = text => {
  const g = cellsOf(text);
  return g.length > 0 && g.every(isLetter);
};

/** Keyboard letters for a language (from languages.json, plus any extra letters found in the data). */
export function alphabetFor(lang) {
  const base = (langInfo(lang)?.letters || []).map(letterKey);
  const seen = new Set(base);
  const extra = [];
  for (const w of wordsFor(lang)) {
    for (const g of cellsOf(w[lang])) {
      const k = letterKey(g);
      if (isLetter(g) && !seen.has(k)) {
        seen.add(k);
        extra.push(k);
      }
    }
  }
  return [...base, ...extra.sort()];
}

/** All letters (with their tone marks) that appear in a language's words – used to fill grids naturally. */
export function letterPool(lang) {
  return wordsFor(lang).flatMap(w => cellsOf(w[lang]).filter(isLetter));
}

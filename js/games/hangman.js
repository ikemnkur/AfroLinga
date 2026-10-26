// Hangman: guess the Igbo/Yorùbá word letter by letter. Tone marks don't need guessing –
// guessing "ẹ" reveals every ẹ, ẹ̀ and ẹ́ in the word.
import { el, pickFresh } from '../util.js';
import { wordsFor, phrasesFor, imageFor, langInfo } from '../data.js';
import { imageView, hint } from '../components.js';
import { sfx } from '../audio.js';
import { graphemes, letterKey, isLetter, alphabetFor } from '../letters.js';

const MAX_MISSES = 6;

function drawing() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'hangman-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path class="hm-frame" d="M10 112 H70 M25 112 V10 H75 V22"/>
    <circle class="hm-part p1" cx="75" cy="32" r="10"/>
    <path class="hm-part p2" d="M75 42 V72"/>
    <path class="hm-part p3" d="M75 50 L60 62"/>
    <path class="hm-part p4" d="M75 50 L90 62"/>
    <path class="hm-part p5" d="M75 72 L62 92"/>
    <path class="hm-part p6" d="M75 72 L88 92"/>`;
  return svg;
}

export default {
  id: 'hangman',
  name: 'Hangman',
  icon: '🪢',
  blurb: 'Guess the word letter by letter',
  modes: [
    { id: 'words', name: 'Words', blurb: 'Picture + English clue' },
    { id: 'picture', name: 'Picture only', blurb: 'No English unless you ask for a hint' },
    { id: 'phrases', name: 'Phrases', blurb: 'Guess whole phrases' },
  ],
  rounds: s => Math.max(3, Math.ceil(s.questionsPerLesson / 2)),

  prepare({ lang, mode }) {
    let pool;
    if (mode === 'phrases') pool = phrasesFor(lang).filter(p => graphemes(p[lang]).length <= 26);
    else pool = wordsFor(lang).filter(w => graphemes(w[lang]).filter(isLetter).length >= 3 && (mode !== 'picture' || imageFor(w)));
    return { pool, alphabet: alphabetFor(lang) };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    const item = pickFresh(state.pool, ctx.used);
    if (!item) return null;

    const chars = graphemes(item[lang]);
    const needed = new Set(chars.filter(isLetter).map(letterKey));
    const guessed = new Set();
    let misses = 0;
    let over = false;

    const slots = chars.map(g =>
      isLetter(g)
        ? el('span', { class: 'hm-slot', dataset: { key: letterKey(g) } }, el('span', { class: 'hm-letter' }, g))
        : el('span', { class: g === ' ' ? 'hm-space' : 'hm-punct' }, g === ' ' ? '' : g),
    );
    const word = el('div', { class: 'hm-word', lang }, slots);
    const svg = drawing();
    const lives = el('div', { class: 'hm-lives', 'aria-live': 'polite' });
    const updateLives = () => (lives.textContent = '❤️'.repeat(MAX_MISSES - misses) + '🤍'.repeat(misses));
    updateLives();

    const alphabet = [...state.alphabet];
    for (const k of needed) if (!alphabet.includes(k)) alphabet.push(k);
    const keys = new Map();
    const keyboard = el('div', { class: 'hm-keys', lang },
      alphabet.map(k => {
        const b = el('button', { type: 'button', class: 'key hm-key', onclick: () => guess(k) }, k);
        keys.set(k, b);
        return b;
      }),
    );

    function finish(won) {
      over = true;
      for (const b of keys.values()) b.disabled = true;
      if (!won) for (const s of slots) if (s.classList.contains('hm-slot') && !s.classList.contains('shown')) s.classList.add('shown', 'missed');
      setTimeout(() => ctx.resolve({ correct: won, answer: item[lang], item, lang, note: `“${item.en}”` }), won ? 500 : 900);
    }

    function guess(k) {
      if (over || guessed.has(k)) return;
      guessed.add(k);
      const btn = keys.get(k);
      if (btn) btn.disabled = true;
      if (needed.has(k)) {
        btn?.classList.add('good');
        sfx('match');
        for (const s of slots) if (s.dataset.key === k) s.classList.add('shown');
        if ([...needed].every(n => guessed.has(n))) finish(true);
      } else {
        btn?.classList.add('bad');
        sfx('incorrect');
        misses++;
        svg.querySelector(`.p${misses}`)?.classList.add('on');
        updateLives();
        if (misses >= MAX_MISSES) finish(false);
      }
    }

    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const k = letterKey(e.key);
      if (keys.has(k)) guess(k);
    };

    const clue =
      mode === 'picture'
        ? el('div', { class: 'stimulus' }, imageView(item, { size: 'md' }), hint(item.en))
        : el('div', { class: 'hm-clue' }, imageFor(item) ? imageView(item, { size: 'xs' }) : null, el('span', {}, item.en));

    return {
      kind: 'auto',
      prompt: `Guess the ${langInfo(lang).name} ${mode === 'phrases' ? 'phrase' : 'word'}`,
      el: el('div', { class: 'exercise hangman' }, clue, el('div', { class: 'hm-stage' }, svg, lives), word, keyboard),
      mounted: () => document.addEventListener('keydown', onKey),
      unmount: () => document.removeEventListener('keydown', onKey),
    };
  },
};

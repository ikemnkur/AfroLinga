// Flip & match memory tiles.
import { el, shuffle, pickFresh, stripMarks } from '../util.js';
import { wordsFor, imageFor, langInfo, visualKey } from '../data.js';
import { imageView } from '../components.js';
import { say, sfx } from '../audio.js';

const PAIRS = 6;

export default {
  id: 'memory',
  name: 'Memory Flip',
  icon: '🃏',
  blurb: 'Flip tiles and find pairs',
  modes: [
    { id: 'words', name: 'Word ↔ English', blurb: 'Pair each word with its English meaning' },
    { id: 'pictures', name: 'Word ↔ Picture', blurb: 'Pair each word with its picture' },
  ],
  rounds: () => 1,

  prepare({ lang, mode }) {
    const words = wordsFor(lang);
    return { pool: mode === 'pictures' ? words.filter(w => imageFor(w)) : words };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    const chosen = [];
    const seen = new Set();
    for (let tries = 0; chosen.length < PAIRS && tries < state.pool.length * 2; tries++) {
      const w = pickFresh(state.pool, ctx.used);
      const key = mode === 'pictures' ? visualKey(imageFor(w)) : w.en;
      if (seen.has(stripMarks(w[lang])) || seen.has(key)) continue;
      seen.add(stripMarks(w[lang]));
      seen.add(key);
      chosen.push(w);
    }
    if (chosen.length < 3) return null;

    const cards = shuffle(chosen.flatMap(w => [{ w, face: 'target' }, { w, face: mode === 'pictures' ? 'picture' : 'en' }]));
    let open = [];
    let busy = false;
    let matched = 0;

    const grid = el('div', { class: 'memory-grid' });
    for (const card of cards) {
      const front =
        card.face === 'target'
          ? el('span', { class: 'mem-text', lang }, card.w[lang])
          : card.face === 'en'
            ? el('span', { class: 'mem-text mem-en', lang: 'en' }, card.w.en)
            : imageView(card.w, { size: 'xs' });
      const btn = el(
        'button',
        { class: 'mem-card', type: 'button', 'aria-label': 'Hidden tile' },
        el('span', { class: 'mem-inner' }, el('span', { class: 'mem-back' }, 'AL'), el('span', { class: 'mem-front' }, front)),
      );
      card.btn = btn;
      btn.addEventListener('click', () => {
        if (busy || btn.classList.contains('flipped')) return;
        btn.classList.add('flipped');
        btn.setAttribute('aria-label', card.face === 'target' ? card.w[lang] : card.w.en);
        sfx('flip');
        if (card.face === 'target') say(card.w, lang);
        open.push(card);
        if (open.length < 2) return;
        const [a, b] = open;
        open = [];
        if (a.w.id === b.w.id) {
          ctx.hit();
          setTimeout(() => sfx('match'), 150);
          a.btn.classList.add('matched');
          b.btn.classList.add('matched');
          if (++matched === chosen.length) setTimeout(() => ctx.complete(), 600);
        } else {
          ctx.miss();
          busy = true;
          setTimeout(() => {
            for (const c of [a, b]) {
              c.btn.classList.remove('flipped');
              c.btn.setAttribute('aria-label', 'Hidden tile');
            }
            busy = false;
          }, 900);
        }
      });
      grid.append(btn);
    }

    return {
      kind: 'board',
      prompt: mode === 'pictures' ? `Match each ${langInfo(lang).name} word to its picture` : `Match each ${langInfo(lang).name} word to its English meaning`,
      el: el('div', { class: 'exercise' }, grid),
    };
  },
};

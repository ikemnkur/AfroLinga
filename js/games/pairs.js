// Match the mixed-up words: target language on the left, English on the right.
import { el, shuffle, pickFresh, stripMarks } from '../util.js';
import { wordsFor, phrasesFor, langInfo } from '../data.js';
import { say, sfx } from '../audio.js';

const PAIRS = 5;

export default {
  id: 'pairs',
  name: 'Match Pairs',
  icon: '🔗',
  blurb: 'Connect the mixed-up words',
  modes: [
    { id: 'words', name: 'Words', blurb: 'Match single words' },
    { id: 'phrases', name: 'Phrases', blurb: 'Match common phrases' },
  ],
  rounds: () => 3,

  prepare({ lang, mode }) {
    const short = p => p[lang].length <= 36 && p.en.length <= 36;
    return { pool: mode === 'phrases' ? phrasesFor(lang).filter(short) : wordsFor(lang) };
  },

  round(ctx) {
    const { lang, state } = ctx;
    // Unique texts on both sides so every pair is unambiguous.
    const chosen = [];
    const seenT = new Set();
    const seenE = new Set();
    for (let tries = 0; chosen.length < PAIRS && tries < state.pool.length * 2; tries++) {
      const item = pickFresh(state.pool, ctx.used);
      const t = stripMarks(item[lang]);
      const e = item.en.toLowerCase();
      if (seenT.has(t) || seenE.has(e)) continue;
      seenT.add(t);
      seenE.add(e);
      chosen.push(item);
    }
    if (chosen.length < 3) return null;

    let left = null;
    let right = null;
    let matched = 0;
    const board = el('div', { class: 'pairs' });
    const colL = el('div', { class: 'pairs-col', lang });
    const colR = el('div', { class: 'pairs-col', lang: 'en' });
    board.append(colL, colR);

    const tryMatch = () => {
      if (!left || !right) return;
      const [l, r] = [left, right];
      left = right = null;
      if (l.item.id === r.item.id) {
        ctx.hit();
        sfx('match');
        for (const b of [l.btn, r.btn]) {
          b.classList.remove('selected');
          b.classList.add('matched');
          b.disabled = true;
        }
        if (++matched === chosen.length) setTimeout(() => ctx.complete(), 350);
      } else {
        ctx.miss();
        sfx('incorrect');
        for (const b of [l.btn, r.btn]) b.classList.add('wrong');
        setTimeout(() => {
          for (const b of [l.btn, r.btn]) b.classList.remove('wrong', 'selected');
        }, 450);
      }
    };

    const makeSide = (items, side, labelOf) =>
      shuffle(items).map(item => {
        const btn = el('button', { class: 'tile pair-tile', type: 'button' }, labelOf(item));
        btn.addEventListener('click', () => {
          const current = side === 'L' ? left : right;
          current?.btn.classList.remove('selected');
          btn.classList.add('selected');
          if (side === 'L') {
            left = { item, btn };
            say(item, lang);
          } else {
            right = { item, btn };
            sfx('tap');
          }
          tryMatch();
        });
        return btn;
      });

    colL.append(...makeSide(chosen, 'L', i => i[lang]));
    colR.append(...makeSide(chosen, 'R', i => i.en));

    return {
      kind: 'board',
      prompt: `Match the ${langInfo(lang).name} to the English`,
      el: el('div', { class: 'exercise' }, el('div', { class: 'pairs-heads' }, el('span', {}, langInfo(lang).name), el('span', {}, 'English')), board),
    };
  },
};

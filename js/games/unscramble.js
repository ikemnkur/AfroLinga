// Unscramble: put the scrambled letters (or the words of a sentence) back in order.
import { el, pickFresh } from '../util.js';
import { wordsFor, sentencesFor, tokensOf, imageFor, langInfo } from '../data.js';
import { imageView, wordBank } from '../components.js';
import { cellsOf, isPlainWord } from '../letters.js';

export default {
  id: 'unscramble',
  name: 'Unscramble',
  icon: '🔀',
  blurb: 'Put the letters back in order',
  modes: [
    { id: 'letters', name: 'Letters', blurb: 'Unscramble the letters of a word' },
    { id: 'sentence', name: 'Sentences', blurb: 'Unscramble the words of a sentence' },
  ],
  rounds: s => s.questionsPerLesson,

  prepare({ lang, mode }) {
    if (mode === 'sentence') return { pool: sentencesFor(lang).filter(s => tokensOf(s, lang).length >= 3 && tokensOf(s, lang).length <= 8) };
    return { pool: wordsFor(lang).filter(w => isPlainWord(w[lang]) && cellsOf(w[lang]).length >= 3) };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    const item = pickFresh(state.pool, ctx.used);
    if (!item) return null;
    const isWord = mode !== 'sentence';
    const pieces = isWord ? cellsOf(item[lang]) : tokensOf(item, lang);
    const bank = wordBank(pieces, { lang, onChange: v => ctx.setReady(v.length === pieces.length) });
    bank.el.classList.add(isWord ? 'letters-bank' : 'sentence-bank');

    return {
      kind: 'check',
      prompt: isWord ? `Unscramble the ${langInfo(lang).name} word` : `Unscramble the ${langInfo(lang).name} sentence`,
      el: el('div', { class: 'exercise' },
        el('div', { class: 'hm-clue' }, imageFor(item) ? imageView(item, { size: 'xs' }) : null, el('span', {}, item.en)),
        bank.el),
      check() {
        const correct = bank.value.join('\u0000').toLowerCase() === pieces.join('\u0000').toLowerCase();
        bank.lock(correct);
        return { correct, answer: item[lang], item, lang, note: `“${item.en}”` };
      },
    };
  },
};

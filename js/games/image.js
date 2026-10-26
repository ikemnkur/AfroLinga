// Image → word: type it, pick it from a word bank, or fill it into a phrase.
import { el, pickFresh } from '../util.js';
import { wordsFor, fillCandidates, imageFor, langInfo } from '../data.js';
import { imageView, hint } from '../components.js';
import { typeRound, bankRound, fillRound } from './common.js';

export default {
  id: 'image',
  name: 'Picture Match',
  icon: '🖼️',
  blurb: 'Name what you see',
  modes: [
    { id: 'type', name: 'Type the word', blurb: 'See a picture, type the word' },
    { id: 'bank', name: 'Word bank', blurb: 'See a picture, choose the word' },
    { id: 'fill', name: 'Fill the phrase', blurb: 'Complete the phrase about the picture' },
  ],
  rounds: s => s.questionsPerLesson,

  prepare({ lang }) {
    const words = wordsFor(lang).filter(w => imageFor(w));
    return { words, fills: fillCandidates(lang).filter(c => imageFor(c.sentence) || imageFor(c.word)) };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    const name = langInfo(lang).name;

    if (mode === 'fill') {
      const cand = pickFresh(state.fills, ctx.used);
      if (!cand) return null;
      const stimulus = el('div', { class: 'stimulus' },
        imageView(imageFor(cand.sentence) ? cand.sentence : cand.word),
        el('p', { class: 'translation' }, cand.sentence.en));
      return fillRound(ctx, { cand, pool: wordsFor(lang), prompt: `Complete the ${name} phrase`, stimulus });
    }

    const item = pickFresh(state.words, ctx.used);
    if (!item) return null;
    const stimulus = el('div', { class: 'stimulus' }, imageView(item), hint(item.en));
    if (mode === 'type') return typeRound(ctx, { item, prompt: `Type this in ${name}`, stimulus });
    return bankRound(ctx, { item, pool: state.words, prompt: `What is this in ${name}?`, stimulus });
  },
};

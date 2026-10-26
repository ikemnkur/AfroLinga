// Picturnary: build the phrase that matches the picture from a word bank.
import { el, pickFresh, sample, normalize, tokenize } from '../util.js';
import { sentencesFor, tokensOf, imageFor, langInfo } from '../data.js';
import { imageView, wordBank, hint } from '../components.js';

export default {
  id: 'picturnary',
  name: 'Picturnary',
  icon: '🎨',
  blurb: 'Build a phrase for the picture',
  modes: [
    { id: 'phrases', name: 'Phrases', blurb: 'Common phrases' },
    { id: 'all', name: 'Phrases + sentences', blurb: 'Includes example sentences' },
  ],
  rounds: s => s.questionsPerLesson,

  prepare({ lang, mode }) {
    const all = sentencesFor(lang).filter(s => tokensOf(s, lang).length >= 2 && tokensOf(s, lang).length <= 8 && imageFor(s));
    return { pool: mode === 'phrases' ? all.filter(s => s.type === 'phrase') : all, all };
  },

  round(ctx) {
    const { lang, state } = ctx;
    const item = pickFresh(state.pool, ctx.used);
    if (!item) return null;
    const tokens = tokensOf(item, lang);
    const own = new Set(tokens.map(normalize));
    const extra = sample(
      [...new Set(state.all.filter(s => s.id !== item.id).flatMap(s => tokensOf(s, lang)))].filter(t => !own.has(normalize(t))),
      Math.min(3, Math.max(2, Math.ceil(tokens.length / 2))),
    );
    const bank = wordBank([...tokens, ...extra], { lang, onChange: v => ctx.setReady(v.length > 0) });
    const accepted = [tokens, ...(item.alt?.[lang] || []).map(tokenize)];

    return {
      kind: 'check',
      prompt: `Build the ${langInfo(lang).name} phrase for this picture`,
      el: el('div', { class: 'exercise' }, el('div', { class: 'stimulus' }, imageView(item), hint(item.en, '💡 Show English')), bank.el),
      check() {
        const answer = bank.value.map(normalize).join(' ');
        const correct = accepted.some(t => t.map(normalize).join(' ') === answer);
        bank.lock(correct);
        return { correct, answer: item[lang], item, lang, note: `“${item.en}”` };
      },
    };
  },
};

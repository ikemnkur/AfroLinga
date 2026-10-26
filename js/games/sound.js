// Sound → text: type what you hear, pick it from a bank, fill the phrase,
// match spoken English to the target language, or pick the matching picture.
import { el, pickFresh, shuffle } from '../util.js';
import { db, wordsFor, fillCandidates, getItem, langInfo, visualKey } from '../data.js';
import { playButton, optionTiles, imageView } from '../components.js';
import { audible } from '../audio.js';
import { typeRound, bankRound, fillRound } from './common.js';

/** Big play button that auto-plays; if nothing can be heard it reveals `fallbackText`. */
function listen(item, lang, fallbackText, quiet) {
  const reveal = el('p', { class: 'fallback-text', lang, hidden: true }, fallbackText);
  const btn = playButton(item, lang, {
    big: true,
    quiet,
    onMissing: () => {
      reveal.hidden = false;
    },
  });
  return { el: el('div', { class: 'stimulus' }, btn, reveal), play: () => btn.play(false) };
}

const silentNote = () =>
  el('p', { class: 'notice' }, '🔇 No recordings found yet, so the text is shown instead. Add audio files to make this a listening exercise.');

export default {
  id: 'sound',
  name: 'Listen & Match',
  icon: '🎧',
  blurb: 'Train your ear',
  modes: [
    { id: 'type', name: 'Type what you hear', blurb: 'Listen, then type the word' },
    { id: 'bank', name: 'Word bank', blurb: 'Listen, then choose the word' },
    { id: 'fill', name: 'Fill the phrase', blurb: 'Listen to a phrase and fill the gap' },
    { id: 'english', name: 'English → native', blurb: 'Hear English, choose the translation' },
    { id: 'picture', name: 'Pick the picture', blurb: 'Listen, then tap the right picture' },
  ],
  rounds: s => s.questionsPerLesson,

  async prepare({ lang, mode }) {
    const words = wordsFor(lang);
    const pick = async (all, l, idOf) => {
      const ok = await audible(all, l, idOf);
      return ok.length ? { pool: ok, silent: false } : { pool: all, silent: true };
    };
    if (mode === 'fill') return { words, ...(await pick(fillCandidates(lang), lang, c => c.sentence.id)) };
    if (mode === 'english') return { words, ...(await pick(words, db.base.code)) };
    if (mode === 'picture') {
      const links = db.imageAudio.filter(l => getItem(l.audioIds[0])?.[lang]);
      return { words, ...(await pick(links, lang, l => l.audioIds[0])) };
    }
    return { words, ...(await pick(words, lang)) };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    const name = langInfo(lang).name;
    const idOf = mode === 'picture' ? l => l.image.id : undefined;
    const target = pickFresh(state.pool, ctx.used, idOf);
    if (!target) return null;
    const wrap = node => (state.silent ? el('div', {}, silentNote(), node) : node);

    if (mode === 'fill') {
      const s = listen(target.sentence, lang, target.sentence[lang], state.silent);
      return fillRound(ctx, { cand: target, pool: state.words, prompt: 'Listen and fill the gap', stimulus: wrap(s.el), onMount: s.play });
    }

    if (mode === 'english') {
      const base = db.base.code;
      const s = listen(target, base, target.en, state.silent);
      return bankRound(ctx, { item: target, pool: state.words, prompt: `Listen to the English. Choose the ${name} word.`, stimulus: wrap(s.el), onMount: s.play });
    }

    if (mode === 'picture') {
      const item = getItem(target.audioIds[0]);
      // Options must look different from the target and from each other, and sound different too.
      const seenLooks = new Set([visualKey(target.image)]);
      const seenText = new Set([item[lang]]);
      const others = [];
      for (const l of shuffle(db.imageAudio)) {
        const look = visualKey(l.image);
        const text = getItem(l.audioIds[0])?.[lang];
        if (!text || seenLooks.has(look) || seenText.has(text)) continue;
        seenLooks.add(look);
        seenText.add(text);
        others.push(l);
        if (others.length === 3) break;
      }
      if (!others.length) return null;
      const s = listen(item, lang, item[lang], state.silent);
      const tiles = optionTiles(shuffle([target, ...others]), {
        keyOf: l => l.image.id,
        render: l => imageView(l.image, { size: 'sm' }),
        onSelect: () => ctx.setReady(true),
      });
      tiles.el.classList.add('picture-options');
      return {
        kind: 'check',
        prompt: 'Listen and tap the matching picture',
        el: el('div', { class: 'exercise' }, wrap(s.el), tiles.el),
        mounted: s.play,
        check() {
          tiles.reveal(target.image.id);
          return { correct: tiles.selected?.image.id === target.image.id, answer: item[lang], item, lang, note: `“${item.en}”` };
        },
      };
    }

    const s = listen(target, lang, target[lang], state.silent);
    if (mode === 'type') return typeRound(ctx, { item: target, prompt: 'Type what you hear', stimulus: wrap(s.el), onMount: s.play });
    return bankRound(ctx, { item: target, pool: state.words, prompt: 'What did you hear?', stimulus: wrap(s.el), onMount: s.play });
  },
};

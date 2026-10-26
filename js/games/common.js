// Exercise builders shared by the image and sound games.
import { el, shuffle, compareAnswer } from '../util.js';
import { acceptedAnswers, distractors } from '../data.js';
import { optionTiles, typeBox } from '../components.js';

/** Type the target-language word/phrase for `item`. */
export function typeRound(ctx, { item, prompt, stimulus, onMount }) {
  const { lang } = ctx;
  const box = typeBox(lang, { onInput: v => ctx.setReady(v.trim().length > 0), onEnter: () => ctx.submit() });
  return {
    kind: 'check',
    prompt,
    el: el('div', { class: 'exercise' }, stimulus, box.el),
    mounted() {
      onMount?.();
      box.focus();
    },
    check() {
      box.lock();
      const result = compareAnswer(box.value, acceptedAnswers(item, lang));
      return { correct: result !== 'wrong', almost: result === 'accents', answer: item[lang], item, lang, note: `“${item.en}”` };
    },
  };
}

/** Pick the right target-language word from a bank of options. */
export function bankRound(ctx, { item, pool, prompt, stimulus, onMount, count = 4 }) {
  const { lang } = ctx;
  const options = shuffle([item, ...distractors(item, pool, count - 1, lang)]);
  if (options.length < 2) return null;
  const tiles = optionTiles(options, {
    render: o => el('span', { lang }, o[lang]),
    onSelect: () => ctx.setReady(true),
  });
  return {
    kind: 'check',
    prompt,
    el: el('div', { class: 'exercise' }, stimulus, tiles.el),
    mounted: onMount,
    check() {
      tiles.reveal(item.id);
      return { correct: tiles.selected?.id === item.id, answer: item[lang], item, lang, note: `“${item.en}”` };
    },
  };
}

/** Fill the missing word in a sentence/phrase. `cand` comes from data.fillCandidates(). */
export function fillRound(ctx, { cand, pool, prompt, stimulus, onMount, count = 4 }) {
  const { lang } = ctx;
  const { sentence, word, tokens, start, length } = cand;
  const blank = el('span', { class: 'blank' }, '\u00a0'.repeat(6));
  const line = el(
    'p',
    { class: 'sentence', lang },
    tokens.slice(0, start).join(' '),
    start ? ' ' : '',
    blank,
    start + length < tokens.length ? ' ' : '',
    tokens.slice(start + length).join(' '),
  );
  const options = shuffle([word, ...distractors(word, pool, count - 1, lang)]);
  if (options.length < 2) return null;
  const tiles = optionTiles(options, {
    render: o => el('span', { lang }, o[lang]),
    onSelect: o => {
      blank.textContent = o[lang];
      blank.classList.add('filled');
      ctx.setReady(true);
    },
  });
  return {
    kind: 'check',
    prompt,
    el: el('div', { class: 'exercise' }, stimulus, line, tiles.el),
    mounted: onMount,
    check() {
      tiles.reveal(word.id);
      const correct = tiles.selected?.id === word.id;
      blank.classList.add(correct ? 'right' : 'wrong-fill');
      return { correct, answer: sentence[lang], item: sentence, lang, note: `“${sentence.en}”` };
    },
  };
}

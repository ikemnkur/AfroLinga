// Schulte table: an English word is shown; find its translation in the grid as fast as you can.
import { el, shuffle, pick, stripMarks, formatDuration } from '../util.js';
import { wordsFor, langInfo } from '../data.js';
import { say, sfx } from '../audio.js';
import { recordBest } from '../store.js';

export default {
  id: 'schulte',
  name: 'Schulte Table',
  icon: '🔢',
  blurb: 'Speed-find words in a grid',
  modes: [
    { id: 'classic', name: 'Classic', blurb: 'The grid stays put' },
    { id: 'shuffle', name: 'Shuffle', blurb: 'The grid reshuffles after every find' },
  ],
  rounds: () => 1,

  prepare({ lang, settings }) {
    return { words: wordsFor(lang), size: settings.schulteSize };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    let size = state.size;
    // Grid of unique translations (shrink the grid if there isn't enough content).
    const unique = [];
    const seen = new Set();
    const seenEn = new Set();
    for (const w of shuffle(state.words)) {
      const k = stripMarks(w[lang]);
      if (seen.has(k) || seenEn.has(w.en)) continue;
      seen.add(k);
      seenEn.add(w.en);
      unique.push(w);
    }
    while (size > 2 && unique.length < size * size) size--;
    if (size < 3) return null;
    ctx.state.playedSize = size;
    const cells = unique.slice(0, size * size);

    const remaining = new Set(cells.map(c => c.id));
    let target = pick(cells);
    const promptWord = el('div', { class: 'schulte-target', lang: 'en' }, target.en);
    const counter = el('div', { class: 'schulte-count' }, `0 / ${cells.length}`);
    const grid = el('div', { class: 'schulte-grid', style: { gridTemplateColumns: `repeat(${size}, 1fr)` }, lang });

    const nextTarget = skip => {
      const left = cells.filter(c => remaining.has(c.id) && (!skip || c.id !== target.id));
      if (!left.length) return;
      target = pick(left);
      promptWord.textContent = target.en;
      promptWord.classList.remove('pop');
      void promptWord.offsetWidth;
      promptWord.classList.add('pop');
    };

    const buttons = cells.map(item => {
      const btn = el('button', { class: 'schulte-cell', type: 'button' }, item[lang]);
      btn.addEventListener('click', () => {
        if (!remaining.has(item.id)) return;
        if (item.id === target.id) {
          ctx.hit();
          sfx('correct');
          say(item, lang);
          remaining.delete(item.id);
          btn.classList.add('found');
          btn.disabled = true;
          counter.textContent = `${cells.length - remaining.size} / ${cells.length}`;
          if (!remaining.size) return setTimeout(() => ctx.complete(), 300);
          if (mode === 'shuffle') grid.replaceChildren(...shuffle(buttons));
          nextTarget();
        } else {
          ctx.miss();
          sfx('incorrect');
          btn.classList.add('wrong');
          setTimeout(() => btn.classList.remove('wrong'), 400);
        }
      });
      return btn;
    });
    grid.append(...shuffle(buttons));

    const skipWord = el('button', { class: 'btn btn-small', type: 'button', onclick: () => (sfx('skip'), nextTarget(true)) }, 'Next word ↻');

    return {
      kind: 'board',
      prompt: `Find the ${langInfo(lang).name} word for:`,
      el: el('div', { class: 'exercise schulte' }, el('div', { class: 'schulte-bar' }, promptWord, el('div', { class: 'schulte-side' }, counter, skipWord)), grid),
    };
  },

  summary(record, ctx) {
    if (!record.completed || record.rounds < 1) return [];
    const size = ctx.state.playedSize;
    const previous = recordBest(`schulte.${ctx.lang}.${size}.${ctx.mode}`, record.durationMs);
    if (previous == null) return [`🏁 First ${size}×${size} time recorded!`];
    return record.durationMs < previous
      ? [`🥇 New best ${size}×${size} time! (previous ${formatDuration(previous)})`]
      : [`Best ${size}×${size} time: ${formatDuration(previous)}`];
  },
};

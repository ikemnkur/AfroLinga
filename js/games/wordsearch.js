// Word search: find the hidden Igbo/Yorùbá words. Drag across a word, or tap its first and last letter.
import { el, shuffle, pick } from '../util.js';
import { wordsFor, imageFor, langInfo } from '../data.js';
import { imageView } from '../components.js';
import { say, sfx } from '../audio.js';
import { cellsOf, isPlainWord, letterPool } from '../letters.js';

const DIRS = {
  easy: [[1, 0], [0, 1]],
  english: [[1, 0], [0, 1], [1, 1]],
  hard: [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1], [-1, 1]],
};
const SIZE = { easy: 7, english: 8, hard: 9 };
const COUNT = { easy: 5, english: 6, hard: 7 };

function placeWords(words, size, dirs) {
  let best = { grid: null, placed: [] };
  for (let attempt = 0; attempt < 30 && best.placed.length < words.length; attempt++) {
    const grid = new Array(size * size).fill(null);
    const placed = [];
    for (const w of [...words].sort((a, b) => b.cells.length - a.cells.length)) {
      const options = [];
      for (const [dx, dy] of dirs) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const ex = x + dx * (w.cells.length - 1);
            const ey = y + dy * (w.cells.length - 1);
            if (ex < 0 || ey < 0 || ex >= size || ey >= size) continue;
            let overlaps = 0;
            let ok = true;
            for (let i = 0; i < w.cells.length && ok; i++) {
              const cur = grid[(y + dy * i) * size + x + dx * i];
              if (cur === null) continue;
              if (cur === w.cells[i]) overlaps++;
              else ok = false;
            }
            if (ok) options.push({ x, y, dx, dy, overlaps });
          }
        }
      }
      if (!options.length) continue;
      // Slight preference for crossings: they make the grid feel denser.
      const max = Math.max(...options.map(o => o.overlaps));
      const o = pick(Math.random() < 0.4 && max > 0 ? options.filter(p => p.overlaps === max) : options);
      const idx = w.cells.map((_, i) => (o.y + o.dy * i) * size + o.x + o.dx * i);
      idx.forEach((p, i) => (grid[p] = w.cells[i]));
      placed.push({ ...w, idx });
    }
    if (placed.length > best.placed.length) best = { grid, placed };
  }
  return best;
}

export default {
  id: 'wordsearch',
  name: 'Word Search',
  icon: '🔍',
  blurb: 'Find the hidden words',
  modes: [
    { id: 'easy', name: 'Easy', blurb: 'Find the listed words (→ ↓)' },
    { id: 'english', name: 'English clues', blurb: 'Find the translations (→ ↓ ↘)' },
    { id: 'hard', name: 'Hard', blurb: 'English clues, all 8 directions' },
  ],
  rounds: () => 1,

  prepare({ lang }) {
    return { words: wordsFor(lang).filter(w => isPlainWord(w[lang])), filler: letterPool(lang) };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    const size = SIZE[mode];
    // Unique words that aren't hidden inside one another (that would make finds ambiguous).
    const chosen = [];
    for (const w of shuffle(state.words)) {
      const cells = cellsOf(w[lang]);
      const key = cells.join('');
      if (cells.length < 3 || cells.length > size) continue;
      if (chosen.some(c => c.key.includes(key) || key.includes(c.key) || c.item.en === w.en)) continue;
      chosen.push({ item: w, cells, key });
      if (chosen.length >= COUNT[mode]) break;
    }
    const { grid, placed } = placeWords(chosen, size, DIRS[mode]);
    if (placed.length < 3) return null;
    for (let i = 0; i < grid.length; i++) if (grid[i] === null) grid[i] = pick(state.filler);

    const found = new Set();
    const cellEls = grid.map((g, i) => el('div', { class: 'ws-cell', dataset: { i } }, g));
    const board = el('div', { class: 'ws-grid', lang, style: { gridTemplateColumns: `repeat(${size}, 1fr)` } }, cellEls);
    const clueEls = new Map();
    const clues = el('div', { class: 'ws-clues' },
      placed.map((w, n) => {
        const label = mode === 'easy'
          ? el('span', { lang }, w.item[lang])
          : el('span', {}, imageFor(w.item) ? [imageView(w.item, { size: 'tiny' }), ' '] : null, w.item.en);
        const chip = el('span', { class: `ws-clue c${n % 7}` }, label);
        clueEls.set(w.key, chip);
        return chip;
      }),
    );
    const counter = el('div', { class: 'schulte-count' }, `0 / ${placed.length}`);

    const line = (a, b) => {
      const [ax, ay, bx, by] = [a % size, Math.floor(a / size), b % size, Math.floor(b / size)];
      const dx = Math.sign(bx - ax);
      const dy = Math.sign(by - ay);
      const len = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      if (!(ax === bx || ay === by || Math.abs(bx - ax) === Math.abs(by - ay))) return null;
      return Array.from({ length: len + 1 }, (_, i) => (ay + dy * i) * size + ax + dx * i);
    };
    const highlight = path => cellEls.forEach((c, i) => c.classList.toggle('sel', !!path?.includes(i)));

    function evaluate(path) {
      highlight(null);
      if (!path || path.length < 2) return;
      const text = path.map(i => grid[i]).join('');
      const back = [...path].reverse().map(i => grid[i]).join('');
      const n = placed.findIndex(w => !found.has(w.key) && (w.key === text || w.key === back));
      if (n < 0) {
        ctx.miss();
        sfx('incorrect');
        for (const i of path) cellEls[i].classList.add('wrong');
        setTimeout(() => path.forEach(i => cellEls[i].classList.remove('wrong')), 350);
        return;
      }
      const w = placed[n];
      found.add(w.key);
      ctx.hit();
      sfx('match');
      say(w.item, lang);
      for (const i of path) cellEls[i].classList.add('found', `c${n % 7}`);
      const chip = clueEls.get(w.key);
      chip.classList.add('done');
      if (mode !== 'easy') chip.append(el('b', { lang }, ` = ${w.item[lang]}`));
      counter.textContent = `${found.size} / ${placed.length}`;
      if (found.size === placed.length) setTimeout(() => ctx.complete(), 500);
    }

    // Pointer handling: drag to select, or tap start then tap end.
    let start = null;
    let anchor = null;
    let path = null;
    const cellAt = e => {
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.ws-cell');
      return t && board.contains(t) ? Number(t.dataset.i) : null;
    };
    board.addEventListener('pointerdown', e => {
      const i = cellAt(e);
      if (i == null) return;
      e.preventDefault();
      start = i;
      path = [i];
      highlight(anchor != null ? [anchor, i] : path);
    });
    board.addEventListener('pointermove', e => {
      if (start == null) return;
      const i = cellAt(e);
      if (i == null) return;
      const p = line(start, i);
      if (p) {
        path = p;
        highlight(path);
      }
    });
    const end = () => {
      if (start == null) return;
      if (path && path.length > 1) {
        anchor = null;
        evaluate(path);
      } else if (anchor != null && anchor !== start) {
        const p = line(anchor, start);
        anchor = null;
        evaluate(p || [start]);
      } else {
        anchor = anchor === start ? null : start;
        highlight(anchor != null ? [anchor] : null);
        sfx('tap');
      }
      start = null;
      path = null;
    };
    board.addEventListener('pointerup', end);
    board.addEventListener('pointercancel', () => {
      start = null;
      highlight(null);
    });

    return {
      kind: 'board',
      prompt: mode === 'easy' ? `Find these ${langInfo(lang).name} words` : `Find the ${langInfo(lang).name} words for:`,
      el: el('div', { class: 'exercise wordsearch' }, el('div', { class: 'ws-head' }, clues, counter), board),
    };
  },
};

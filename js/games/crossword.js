// Crossword: generated from the dictionary each time. Clues are English words or pictures;
// tap a clue (or a square) and type the Igbo/Yorùbá answer.
import { el, shuffle, pick, compareAnswer } from '../util.js';
import { wordsFor, imageFor, langInfo } from '../data.js';
import { imageView, typeBox } from '../components.js';
import { say, sfx } from '../audio.js';
import { cellsOf, isPlainWord } from '../letters.js';

const MAX_WORDS = 7;
const MAX_W = 10;
const MAX_H = 12;

const pos = (x, y) => `${x},${y}`;

/** Greedy crossword generator: keeps the best of several random attempts. */
function generate(cands) {
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = new Map(); // pos -> { g, h, v }
    const placed = [];
    let crossings = 0;
    const order = shuffle(cands);

    const fits = (w, x, y, dir) => {
      const [dx, dy] = dir === 'h' ? [1, 0] : [0, 1];
      const n = w.cells.length;
      if (grid.has(pos(x - dx, y - dy)) || grid.has(pos(x + dx * n, y + dy * n))) return -1;
      let cross = 0;
      for (let i = 0; i < n; i++) {
        const cx = x + dx * i;
        const cy = y + dy * i;
        const cell = grid.get(pos(cx, cy));
        if (cell) {
          if (cell.g !== w.cells[i] || cell[dir]) return -1;
          cross++;
        } else if (dir === 'h' ? grid.has(pos(cx, cy - 1)) || grid.has(pos(cx, cy + 1)) : grid.has(pos(cx - 1, cy)) || grid.has(pos(cx + 1, cy))) {
          return -1;
        }
      }
      return cross;
    };
    const bounds = extra => {
      const xs = [];
      const ys = [];
      for (const k of [...grid.keys(), ...extra]) {
        const [x, y] = k.split(',').map(Number);
        xs.push(x);
        ys.push(y);
      }
      return { minX: Math.min(...xs), minY: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
    };
    const put = (w, x, y, dir) => {
      const [dx, dy] = dir === 'h' ? [1, 0] : [0, 1];
      w.cells.forEach((g, i) => {
        const k = pos(x + dx * i, y + dy * i);
        const cell = grid.get(k) || { g };
        cell[dir] = true;
        grid.set(k, cell);
      });
      placed.push({ ...w, x, y, dir });
    };

    put(order[0], 0, 0, 'h');
    for (const w of order.slice(1)) {
      if (placed.length >= MAX_WORDS) break;
      const options = [];
      for (const p of placed) {
        const dir = p.dir === 'h' ? 'v' : 'h';
        p.cells.forEach((g, i) => {
          const cx = p.dir === 'h' ? p.x + i : p.x;
          const cy = p.dir === 'h' ? p.y : p.y + i;
          w.cells.forEach((g2, j) => {
            if (g2 !== g) return;
            const x = dir === 'h' ? cx - j : cx;
            const y = dir === 'v' ? cy - j : cy;
            const cross = fits(w, x, y, dir);
            if (cross < 1) return;
            const [dx, dy] = dir === 'h' ? [1, 0] : [0, 1];
            const b = bounds(w.cells.map((_, k) => pos(x + dx * k, y + dy * k)));
            if (b.w > MAX_W || b.h > MAX_H) return;
            options.push({ x, y, dir, cross });
          });
        });
      }
      if (!options.length) continue;
      const most = Math.max(...options.map(o => o.cross));
      const o = pick(options.filter(op => op.cross === most));
      crossings += o.cross;
      put(w, o.x, o.y, o.dir);
    }
    const score = placed.length * 10 + crossings;
    if (!best || score > best.score) best = { score, placed, grid, ...bounds([]) };
    if (placed.length >= MAX_WORDS && crossings >= MAX_WORDS) break;
  }
  return best;
}

export default {
  id: 'crossword',
  name: 'Crossword',
  icon: '✏️',
  blurb: 'Solve a mini crossword',
  modes: [
    { id: 'english', name: 'English clues', blurb: 'Clues are English words' },
    { id: 'picture', name: 'Picture clues', blurb: 'Clues are pictures' },
  ],
  rounds: () => 1,

  prepare({ lang, mode }) {
    const words = wordsFor(lang).filter(w => isPlainWord(w[lang]) && cellsOf(w[lang]).length >= 3 && cellsOf(w[lang]).length <= 8);
    return { words: mode === 'picture' ? words.filter(w => imageFor(w)) : words };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    const seen = new Set();
    const cands = [];
    for (const item of shuffle(state.words)) {
      const cells = cellsOf(item[lang]);
      const key = cells.join('');
      if (seen.has(key) || seen.has(item.en)) continue;
      seen.add(key);
      seen.add(item.en);
      cands.push({ item, cells, key });
      if (cands.length >= 24) break;
    }
    if (cands.length < 3) return null;
    const puzzle = generate(cands);
    if (!puzzle || puzzle.placed.length < 3) return null;

    // Normalise coordinates and number the clues (top-to-bottom, left-to-right).
    const words = puzzle.placed.map(w => ({ ...w, x: w.x - puzzle.minX, y: w.y - puzzle.minY, solved: false }));
    const starts = [...new Set(words.map(w => pos(w.x, w.y)))].sort((a, b) => {
      const [ax, ay] = a.split(',').map(Number);
      const [bx, by] = b.split(',').map(Number);
      return ay - by || ax - bx;
    });
    for (const w of words) {
      w.num = starts.indexOf(pos(w.x, w.y)) + 1;
      w.positions = w.cells.map((_, i) => (w.dir === 'h' ? pos(w.x + i, w.y) : pos(w.x, w.y + i)));
    }

    const cellEls = new Map();
    const board = el('div', { class: 'cw-grid', lang, style: { gridTemplateColumns: `repeat(${puzzle.w}, 1fr)` } });
    for (let y = 0; y < puzzle.h; y++) {
      for (let x = 0; x < puzzle.w; x++) {
        const k = pos(x, y);
        const g = puzzle.grid.get(pos(x + puzzle.minX, y + puzzle.minY));
        if (!g) {
          board.append(el('div', { class: 'cw-void' }));
          continue;
        }
        const num = starts.indexOf(k) + 1;
        const cell = el('button', { type: 'button', class: 'cw-cell', 'aria-label': `square ${x + 1},${y + 1}` },
          num ? el('span', { class: 'cw-num' }, String(num)) : null,
          el('span', { class: 'cw-letter' }, g.g));
        cell.addEventListener('click', () => {
          const owners = words.filter(w => w.positions.includes(k));
          // Tapping a crossing square of the selected word switches direction.
          const next = owners.length > 1 && owners.includes(current) ? owners.find(w => w !== current) : owners.find(w => !w.solved) || owners[0];
          select(next);
        });
        cellEls.set(k, cell);
        board.append(cell);
      }
    }

    const clueView = w => (mode === 'picture' ? imageView(w.item, { size: 'tiny' }) : el('span', {}, w.item.en));
    const clueEls = new Map();
    const clueList = dir =>
      el('div', { class: 'cw-clue-group' },
        el('h3', {}, dir === 'h' ? 'Across →' : 'Down ↓'),
        words.filter(w => w.dir === dir).sort((a, b) => a.num - b.num).map(w => {
          const b = el('button', { type: 'button', class: 'cw-clue', onclick: () => select(w) }, el('b', {}, `${w.num}.`), ' ', clueView(w), el('small', {}, ` (${w.cells.length})`));
          clueEls.set(w, b);
          return b;
        }));

    const activeLabel = el('div', { class: 'cw-active-label' });
    const box = typeBox(lang, { onEnter: () => attempt(), placeholder: 'Type the answer…' });
    const tryBtn = el('button', { type: 'button', class: 'btn btn-primary btn-small-wide', onclick: () => attempt() }, 'Enter');
    const hintBtn = el('button', { type: 'button', class: 'btn btn-small', onclick: () => revealLetter() }, '💡 Letter');
    let current = null;

    function select(w) {
      if (!w) return;
      current = w;
      for (const [k, c] of cellEls) c.classList.toggle('active', w.positions.includes(k));
      for (const [cw, b] of clueEls) b.classList.toggle('active', cw === w);
      activeLabel.replaceChildren(
        el('b', {}, `${w.num} ${w.dir === 'h' ? 'Across' : 'Down'}: `),
        mode === 'picture' ? imageView(w.item, { size: 'xs' }) : el('span', {}, w.item.en),
        el('small', { class: 'muted' }, ` ${w.cells.length} letters`),
      );
      box.clear();
      sfx('tap');
    }

    const nextUnsolved = () => {
      const i = words.indexOf(current);
      return [...words.slice(i + 1), ...words.slice(0, i + 1)].find(w => !w.solved);
    };

    function markSolved(w, earned) {
      w.solved = true;
      for (const k of w.positions) cellEls.get(k).classList.add('shown', 'solved');
      clueEls.get(w).classList.add('done');
      if (earned) {
        ctx.hit();
        sfx('correct');
      }
      say(w.item, lang);
      // A crossing word may now be fully revealed by hints/other answers.
      for (const other of words) {
        if (!other.solved && other.positions.every(k => cellEls.get(k).classList.contains('shown'))) markSolved(other, false);
      }
      if (words.every(x => x.solved)) {
        box.lock();
        setTimeout(() => ctx.complete(), 600);
        return;
      }
      if (current?.solved) select(nextUnsolved());
    }

    function attempt() {
      if (!current || current.solved || !box.value.trim()) return;
      const result = compareAnswer(box.value, [current.item[lang]]);
      if (result === 'wrong') {
        ctx.miss();
        sfx('incorrect');
        box.shake();
        return;
      }
      markSolved(current, true);
    }

    function revealLetter() {
      if (!current || current.solved) return;
      const hidden = current.positions.filter(k => !cellEls.get(k).classList.contains('shown'));
      if (!hidden.length) return;
      cellEls.get(pick(hidden)).classList.add('shown', 'hinted');
      sfx('flip');
      const completed = words.find(w => !w.solved && w.positions.every(k => cellEls.get(k).classList.contains('shown')));
      if (completed) markSolved(completed, false);
    }

    select(words.find(w => w.num === 1) || words[0]);

    return {
      kind: 'board',
      prompt: `Crossword (${langInfo(lang).name})`,
      el: el('div', { class: 'exercise crossword' },
        board,
        el('div', { class: 'cw-entry' }, activeLabel, box.el, el('div', { class: 'cw-actions' }, hintBtn, tryBtn)),
        el('div', { class: 'cw-clues' }, clueList('h'), clueList('v'))),
    };
  },
};

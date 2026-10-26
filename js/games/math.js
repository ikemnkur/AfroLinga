// Math in the target language: numbers are shown and answered as Igbo/Yoruba number words.
import { el, pick } from '../util.js';
import { numbersFor, langInfo } from '../data.js';
import { optionTiles } from '../components.js';
import { say, sfx } from '../audio.js';

const OPS = { add: '+', sub: '−', mul: '×', div: '÷' };

function buildProblems(byValue) {
  const values = [...byValue.keys()];
  const has = v => byValue.has(v);
  const add = [], sub = [], mul = [], div = [];
  for (const a of values) {
    for (const b of values) {
      if (a <= 20 && b <= 20 && has(a + b) && a + b > 0) add.push([a, b, a + b]);
      if (a >= b && has(a - b) && a <= 30) sub.push([a, b, a - b]);
      if (a >= 1 && b >= 1 && a <= 10 && b <= 10 && has(a * b)) {
        mul.push([a, b, a * b]);
        div.push([a * b, b, a]);
      }
    }
  }
  return { add, sub, mul, div };
}

export default {
  id: 'math',
  name: 'Number Fun',
  icon: '➗',
  blurb: 'Count and calculate in the language',
  modes: [
    { id: 'add', name: 'Adding', blurb: 'Plus' },
    { id: 'sub', name: 'Subtracting', blurb: 'Take away' },
    { id: 'compare', name: 'Comparing', blurb: 'Bigger, smaller or equal?' },
    { id: 'muldiv', name: 'Multiply & divide', blurb: 'Times tables' },
    { id: 'mixed', name: 'Mixed', blurb: 'A bit of everything' },
  ],
  rounds: s => s.questionsPerLesson,

  prepare({ lang }) {
    const byValue = new Map(numbersFor(lang).map(n => [n.value, n]));
    return { byValue, problems: buildProblems(byValue), digits: false };
  },

  round(ctx) {
    const { lang, state } = ctx;
    const { byValue, problems } = state;
    if (byValue.size < 4) return null;

    let mode = ctx.mode;
    if (mode === 'mixed') mode = pick(['add', 'sub', 'compare', 'mul', 'div']);
    if (mode === 'muldiv') mode = pick(['mul', 'div']);

    // A number chip: tap to hear it; digit shown under it when hints are on.
    const chip = n =>
      el('button', { class: 'num-chip', type: 'button', onclick: () => say(n, lang) },
        el('span', { class: 'num-word', lang }, n[lang]),
        el('span', { class: 'num-digit' }, String(n.value)));
    const digitsBtn = el('button', { class: 'hint-btn', type: 'button' }, '🔢 Show digits');
    const expr = el('div', { class: `math-expr${state.digits ? ' show-digits' : ''}` });
    digitsBtn.addEventListener('click', () => {
      state.digits = !state.digits;
      expr.classList.toggle('show-digits', state.digits);
      digitsBtn.textContent = state.digits ? '🔢 Hide digits' : '🔢 Show digits';
      sfx('tap');
    });
    if (state.digits) digitsBtn.textContent = '🔢 Hide digits';

    if (mode === 'compare') {
      const values = [...byValue.keys()].filter(v => v <= 20);
      const a = pick(values);
      const b = Math.random() < 0.15 ? a : pick(values.filter(v => v !== a));
      const correct = a < b ? '<' : a > b ? '>' : '=';
      expr.append(chip(byValue.get(a)), el('span', { class: 'math-op math-q' }, '?'), chip(byValue.get(b)));
      const tiles = optionTiles(
        [{ id: '<', label: '<', en: 'is less than' }, { id: '=', label: '=', en: 'equals' }, { id: '>', label: '>', en: 'is greater than' }],
        { columns: 3, render: o => el('span', { class: 'cmp' }, el('b', {}, o.label), el('small', {}, o.en)), onSelect: () => ctx.setReady(true) },
      );
      return {
        kind: 'check',
        prompt: 'Which sign goes in the middle?',
        el: el('div', { class: 'exercise' }, expr, digitsBtn, tiles.el),
        check() {
          tiles.reveal(correct);
          expr.classList.add('show-digits');
          return { correct: tiles.selected?.id === correct, answer: `${byValue.get(a)[lang]} ${correct} ${byValue.get(b)[lang]}`, note: `${a} ${correct} ${b}` };
        },
      };
    }

    const list = problems[mode];
    if (!list?.length) return null;
    const [a, b, c] = pick(list);
    const [na, nb, nc] = [a, b, c].map(v => byValue.get(v));
    expr.append(chip(na), el('span', { class: 'math-op' }, OPS[mode]), chip(nb), el('span', { class: 'math-op' }, '='), el('span', { class: 'math-op math-q' }, '?'));

    // Distractors: the closest other values, so the choice actually requires knowing the words.
    const near = [...byValue.values()]
      .filter(n => n.value !== c)
      .sort((x, y) => Math.abs(x.value - c) - Math.abs(y.value - c) || Math.random() - 0.5)
      .slice(0, 3);
    const options = [nc, ...near].sort(() => Math.random() - 0.5);
    const tiles = optionTiles(options, { render: n => el('span', { lang }, n[lang]), onSelect: () => ctx.setReady(true) });

    return {
      kind: 'check',
      prompt: `Solve it in ${langInfo(lang).name}`,
      el: el('div', { class: 'exercise' }, expr, digitsBtn, tiles.el),
      check() {
        tiles.reveal(nc.id);
        expr.classList.add('show-digits');
        return {
          correct: tiles.selected?.id === nc.id,
          answer: `${na[lang]} ${OPS[mode]} ${nb[lang]} = ${nc[lang]}`,
          item: nc,
          lang,
          note: `${a} ${OPS[mode]} ${b} = ${c}`,
        };
      },
    };
  },
};

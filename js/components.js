// Reusable exercise widgets.
import { el, toast, shuffle } from './util.js';
import { imageFor, langInfo } from './data.js';
import { say, sfx } from './audio.js';

/** Picture for a text item, or a specific image entry. Falls back to the emoji placeholder. */
export function imageView(itemOrImage, { size = 'lg', caption = null } = {}) {
  const image = itemOrImage?.src !== undefined ? itemOrImage : imageFor(itemOrImage);
  const fallbackEmoji = image?.placeholder || itemOrImage?.emoji || '🖼️';
  const placeholder = () => el('div', { class: 'placeholder', 'aria-hidden': 'true' }, fallbackEmoji);
  const fig = el('figure', { class: `picture picture-${size}` });
  if (image?.src) {
    const img = el('img', { src: image.src, alt: '', loading: 'lazy', draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
    fig.append(img);
  } else {
    fig.append(placeholder());
  }
  if (caption) fig.append(el('figcaption', {}, caption));
  return fig;
}

/** Button that speaks an item. If no audio is available, calls onMissing (e.g. to reveal the text). */
export function playButton(item, lang, { big = false, label = null, onMissing = null, quiet = false } = {}) {
  const play = async slow => {
    btn.classList.add('playing');
    const result = await say(item, lang, { slow });
    setTimeout(() => btn.classList.remove('playing'), 600);
    if (!result) {
      if (!quiet) toast(`No ${langInfo(lang)?.name || lang} recording for this yet`);
      onMissing?.();
    }
    return result;
  };
  const btn = el(
    'button',
    { class: big ? 'play-btn play-big' : 'play-btn', type: 'button', 'aria-label': label || 'Play audio', onclick: () => play(false) },
    '🔊',
  );
  if (!big) return Object.assign(btn, { play });
  const slowBtn = el('button', { class: 'play-btn play-slow', type: 'button', 'aria-label': 'Play slowly', onclick: () => play(true) }, '🐢');
  return Object.assign(el('div', { class: 'play-row' }, btn, slowBtn), { play });
}

/** Grid of selectable option tiles. */
export function optionTiles(options, { render, onSelect, columns = 2, keyOf = o => o.id } = {}) {
  let selected = null;
  const buttons = new Map();
  const grid = el('div', { class: `options cols-${columns}` });
  for (const opt of options) {
    const b = el('button', { class: 'tile', type: 'button' }, render(opt));
    b.addEventListener('click', () => {
      if (grid.classList.contains('locked')) return;
      sfx('tap');
      for (const x of buttons.values()) x.classList.remove('selected');
      b.classList.add('selected');
      selected = opt;
      onSelect?.(opt);
    });
    buttons.set(keyOf(opt), b);
    grid.append(b);
  }
  return {
    el: grid,
    get selected() {
      return selected;
    },
    reveal(correctKey) {
      grid.classList.add('locked');
      for (const [k, b] of buttons) {
        if (k === correctKey) b.classList.add('correct');
        else if (b.classList.contains('selected')) b.classList.add('wrong');
      }
    },
  };
}

/** Text input with a row of special-character keys for the target language. */
export function typeBox(lang, { onInput, onEnter, placeholder } = {}) {
  const info = langInfo(lang);
  const input = el('input', {
    class: 'type-input',
    type: 'text',
    lang,
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    placeholder: placeholder || `Type in ${info?.name || lang}…`,
  });
  input.addEventListener('input', () => onInput?.(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.();
    }
  });
  const keys = el(
    'div',
    { class: 'special-keys', 'aria-label': 'Special characters' },
    (info?.specialChars || []).map(ch =>
      el(
        'button',
        {
          type: 'button',
          class: 'key',
          onpointerdown: e => e.preventDefault(), // keep focus (and the phone keyboard) on the input
          onclick: () => {
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            input.setRangeText(ch, start, end, 'end');
            input.focus();
            onInput?.(input.value);
          },
        },
        ch,
      ),
    ),
  );
  return {
    el: el('div', { class: 'type-box' }, input, keys),
    get value() {
      return input.value;
    },
    focus: () => setTimeout(() => input.focus({ preventScroll: true }), 50),
    clear() {
      input.value = '';
      onInput?.('');
    },
    shake() {
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
    },
    lock() {
      input.readOnly = true;
      keys.classList.add('hidden');
    },
  };
}

/** "Tap to reveal" hint, e.g. the English meaning. */
export function hint(text, label = '💡 Hint') {
  const btn = el('button', { class: 'hint-btn', type: 'button' }, label);
  btn.addEventListener('click', () => {
    btn.replaceWith(el('span', { class: 'hint-text' }, text));
    sfx('tap');
  });
  return btn;
}

/**
 * Word bank: tap tiles to move them into the answer line and back again.
 * `tokens` are strings; duplicates are supported.
 */
export function wordBank(tokens, { lang, onChange } = {}) {
  const answer = el('div', { class: 'answer-line', lang });
  const bank = el('div', { class: 'bank', lang });
  const order = [];
  const original = tokens.join('\u0000');
  let dealt = shuffle(tokens.map((text, i) => ({ text, i })));
  // Never deal the tiles already in the solved order.
  for (let tries = 0; tries < 12 && new Set(tokens).size > 1 && dealt.map(t => t.text).join('\u0000') === original; tries++) {
    dealt = shuffle(dealt);
  }
  const tiles = dealt.map(t => {
    const slot = el('span', { class: 'bank-slot' });
    const tile = el('button', { class: 'token', type: 'button' }, t.text);
    slot.append(tile);
    bank.append(slot);
    tile.addEventListener('click', () => {
      if (answer.classList.contains('locked')) return;
      sfx('tap');
      if (tile.parentElement === answer) {
        slot.append(tile);
        order.splice(order.indexOf(t), 1);
      } else {
        answer.append(tile);
        order.push(t);
      }
      onChange?.(order.map(o => o.text));
    });
    return tile;
  });
  return {
    el: el('div', { class: 'word-bank' }, answer, bank),
    get value() {
      return order.map(o => o.text);
    },
    lock(correct) {
      answer.classList.add('locked', correct ? 'correct' : 'wrong');
      for (const t of tiles) t.disabled = true;
    },
  };
}

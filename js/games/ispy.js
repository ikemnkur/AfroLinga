// I Spy: a scene full of pictures. "I spy… <word>" – tap the matching picture.
import { el, shuffle, pick } from '../util.js';
import { wordsFor, imageFor, langInfo, visualKey } from '../data.js';
import { imageView, playButton } from '../components.js';
import { say, sfx, audible } from '../audio.js';
import { cellsOf, letterKey, isLetter } from '../letters.js';

const SCENE = 12;
const FINDS = 6;

const firstLetter = (item, lang) => letterKey(cellsOf(item[lang]).find(isLetter) || '');

export default {
  id: 'ispy',
  name: 'I Spy',
  icon: '👀',
  blurb: 'Spot the picture in the scene',
  modes: [
    { id: 'read', name: 'Read', blurb: 'I spy… (word shown)' },
    { id: 'listen', name: 'Listen', blurb: 'I spy… (word spoken)' },
    { id: 'letter', name: 'First letter', blurb: 'I spy something beginning with…' },
  ],
  rounds: () => 2,

  async prepare({ lang, mode }) {
    const words = wordsFor(lang).filter(w => imageFor(w));
    if (mode !== 'listen') return { words };
    const ok = await audible(words, lang);
    return { words, audibleIds: ok.length ? new Set(ok.map(w => w.id)) : null };
  },

  round(ctx) {
    const { lang, mode, state } = ctx;
    const scene = [];
    const seen = new Set();
    for (const w of shuffle(state.words)) {
      const keys = [w[lang].toLowerCase(), w.en, visualKey(imageFor(w))];
      if (keys.some(k => seen.has(k))) continue;
      keys.forEach(k => seen.add(k));
      scene.push(w);
      if (scene.length >= SCENE) break;
    }
    if (scene.length < 4) return null;

    const silent = mode === 'listen' && !state.audibleIds;
    const found = new Set();
    let finds = 0;
    let target = null;
    const goal = Math.min(FINDS, scene.length);

    const spy = el('div', { class: 'spy-target' });
    const counter = el('div', { class: 'schulte-count' }, `0 / ${goal}`);

    const setTarget = skip => {
      let options = scene.filter(w => !found.has(w.id) && (!skip || w.id !== target?.id));
      if (mode === 'listen' && state.audibleIds) {
        const heard = options.filter(w => state.audibleIds.has(w.id));
        if (heard.length) options = heard;
      }
      if (!options.length) options = scene.filter(w => !found.has(w.id));
      if (!options.length) return;
      target = pick(options);
      if (mode === 'read') {
        spy.replaceChildren(el('span', { class: 'spy-lead' }, 'I spy…'), el('span', { class: 'spy-word', lang }, target[lang]));
      } else if (mode === 'listen') {
        const btn = playButton(target, lang, { quiet: silent, onMissing: () => spy.querySelector('.spy-word')?.removeAttribute('hidden') });
        spy.replaceChildren(el('span', { class: 'spy-lead' }, 'I spy…'), btn, el('span', { class: 'spy-word', lang, hidden: !silent }, target[lang]));
        btn.play(false);
      } else {
        const letter = firstLetter(target, lang);
        spy.replaceChildren(el('span', { class: 'spy-lead' }, 'I spy something beginning with'), el('span', { class: 'spy-word spy-letter', lang }, letter));
      }
      spy.classList.remove('pop');
      void spy.offsetWidth;
      spy.classList.add('pop');
    };

    const isMatch = w => (mode === 'letter' ? firstLetter(w, lang) === firstLetter(target, lang) : w.id === target.id);

    const sceneEl = el('div', { class: 'spy-scene' },
      shuffle(scene).map(w => {
        const caption = el('span', { class: 'spy-caption', lang }, w[lang]);
        const tilt = (Math.random() * 20 - 10).toFixed(1);
        const scale = (0.88 + Math.random() * 0.24).toFixed(2);
        const btn = el('button', { type: 'button', class: 'spy-item', style: { '--tilt': `${tilt}deg`, '--scale': scale }, 'aria-label': w.en },
          imageView(w, { size: 'sm' }), caption);
        btn.addEventListener('click', () => {
          if (found.has(w.id) || !target) return;
          if (isMatch(w)) {
            found.add(w.id);
            finds++;
            ctx.hit();
            sfx('correct');
            say(w, lang);
            btn.classList.add('found');
            counter.textContent = `${finds} / ${goal}`;
            if (finds >= goal) return setTimeout(() => ctx.complete(), 600);
            setTimeout(() => setTarget(), 450);
          } else {
            ctx.miss();
            sfx('incorrect');
            btn.classList.add('nope');
            setTimeout(() => btn.classList.remove('nope'), 1100);
          }
        });
        return btn;
      }),
    );

    const next = el('button', { class: 'btn btn-small', type: 'button', onclick: () => (sfx('skip'), setTarget(true)) }, 'Next ↻');
    setTarget();

    return {
      kind: 'board',
      prompt: `Find it in the picture (${langInfo(lang).name})`,
      el: el('div', { class: 'exercise ispy' },
        silent ? el('p', { class: 'notice' }, '🔇 No recordings found yet, so the word is shown instead.') : null,
        el('div', { class: 'spy-bar' }, spy, el('div', { class: 'schulte-side' }, counter, next)),
        sceneEl),
    };
  },
};

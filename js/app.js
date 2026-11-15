// App shell: routing, home, mode picker, dictionary, stats and settings screens.
import { el, formatDuration } from './util.js';
import { db, loadData, langInfo, imageFor, categoryOf } from './data.js';
import { settings, saveSettings, computeStats, clearHistory, TEXT_SIZES } from './store.js';
import { unlockAudio, sfx } from './audio.js';
import { playButton, imageView } from './components.js';
import { recordButton, closeRecorder } from './recorder.js';
import { listRecordings } from './recordings.js';
import { createRecordingArchive } from './recording-export.js';
import { runLesson, statCard } from './lesson.js';
import { initPWA, showInstallSheet, cacheAssets, offlineStatus, onPwaChange, isStandalone } from './pwa.js';

import image from './games/image.js';
import sound from './games/sound.js';
import pairs from './games/pairs.js';
import schulte from './games/schulte.js';
import memory from './games/memory.js';
import picturnary from './games/picturnary.js';
import math from './games/math.js';
import crossword from './games/crossword.js';
import ispy from './games/ispy.js';
import hangman from './games/hangman.js';
import unscramble from './games/unscramble.js';
import wordsearch from './games/wordsearch.js';

const GAMES = [image, sound, pairs, schulte, memory, picturnary, ispy, crossword, wordsearch, hangman, unscramble, math];
const app = document.getElementById('app');
let disposeScreen = null;

// ---------- routing ----------

function route() {
  disposeScreen?.();
  disposeScreen = null;
  const [, screen = 'home', a, b] = (location.hash || '#/home').split('/');
  window.scrollTo(0, 0);
  if (screen === 'play' && a && b) return playScreen(a, b);
  if (screen === 'game' && a) return modeScreen(a);
  if (screen === 'dictionary') return dictionaryScreen();
  if (screen === 'stats') return statsScreen();
  if (screen === 'settings') return settingsScreen();
  return homeScreen();
}

const go = hash => {
  if (location.hash === hash) route();
  else location.hash = hash;
};

function shell(active, ...content) {
  const tab = (hash, icon, label, id) =>
    el('a', { href: hash, class: `tab${active === id ? ' active' : ''}`, 'aria-current': active === id ? 'page' : null }, el('span', { class: 'tab-icon' }, icon), el('span', {}, label));
  app.replaceChildren(
    el('div', { class: 'screen' }, ...content),
    el('nav', { class: 'tabbar' }, tab('#/home', '🎓', 'Learn', 'home'), tab('#/dictionary', '📚', 'Words', 'dictionary'), tab('#/stats', '📈', 'Progress', 'stats'), tab('#/settings', '⚙️', 'Settings', 'settings')),
  );
}

function langSwitch(onChange) {
  return el(
    'div',
    { class: 'lang-switch', role: 'radiogroup', 'aria-label': 'Language to learn' },
    db.languages.map(l =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(settings.lang === l.code),
          class: settings.lang === l.code ? 'on' : '',
          onclick: () => {
            saveSettings({ lang: l.code });
            sfx('tap');
            onChange();
          },
        },
        el('span', {}, l.name),
        el('small', {}, l.native),
      ),
    ),
  );
}

// ---------- screens ----------

function textSizeSwitch(onChange) {
  return el(
    'div',
    { class: 'lang-switch size-switch', role: 'radiogroup', 'aria-label': 'Text size' },
    TEXT_SIZES.map(s =>
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          'data-size': s.id,
          'aria-checked': String(settings.textSize === s.id),
          class: settings.textSize === s.id ? 'on' : '',
          onclick: () => {
            saveSettings({ textSize: s.id });
            sfx('tap');
            onChange();
          },
        },
        el('span', { class: 'size-sample', 'aria-hidden': 'true' }, 'Aa'),
        el('small', {}, s.id === 'medium' ? `${s.label} (default)` : s.label),
      ),
    ),
  );
}

function homeScreen() {
  const stats = computeStats();
  const lang = langInfo(settings.lang);
  shell(
    'home',
    el('header', { class: 'hero' },
      el('div', { class: 'brand' }, el('img', { src: 'icons/icon.svg', alt: '', class: 'logo' }), el('h1', {}, 'AfroLinga')),
      el('p', { class: 'tagline' }, `Learning ${lang.name} · ${lang.native}`),
      el('div', { class: 'today' },
        el('span', {}, `⏱ Today ${formatDuration(stats.todayMs)}`),
        el('span', {}, `🔥 ${stats.streak} day streak`),
        navigator.onLine ? null : el('span', { class: 'offline-pill' }, '✈️ Offline'),
        isStandalone() ? null : el('button', { class: 'install-chip', type: 'button', onclick: () => showInstallSheet({ manual: true }) }, '📲 Install app')),
    ),
    langSwitch(homeScreen),
    el('h2', { class: 'section-title' }, 'Practice'),
    el('div', { class: 'game-grid' },
      GAMES.map(g =>
        el('a', { class: 'game-card', href: `#/game/${g.id}` },
          el('span', { class: 'game-icon' }, g.icon),
          el('span', { class: 'game-name' }, g.name),
          el('span', { class: 'game-blurb' }, g.blurb),
          stats.perGame[g.id] ? el('span', { class: 'game-time' }, `⏱ ${formatDuration(stats.perGame[g.id].ms)}`) : null,
        ),
      ),
    ),
  );
}

function modeScreen(gameId) {
  const game = GAMES.find(g => g.id === gameId);
  if (!game) return go('#/home');
  if (game.modes.length === 1) return go(`#/play/${game.id}/${game.modes[0].id}`);
  shell(
    'home',
    el('header', { class: 'page-head' },
      el('a', { href: '#/home', class: 'icon-btn', 'aria-label': 'Back' }, '←'),
      el('h1', {}, `${game.icon} ${game.name}`)),
    langSwitch(() => modeScreen(gameId)),
    el('p', { class: 'muted center' }, 'Choose how you want to practise'),
    el('div', { class: 'mode-list' },
      game.modes.map(m =>
        el('a', { class: 'mode-card', href: `#/play/${game.id}/${m.id}` },
          el('span', { class: 'mode-name' }, m.name),
          el('span', { class: 'mode-blurb' }, m.blurb),
          el('span', { class: 'chev' }, '›'),
        ),
      ),
    ),
  );
}

function playScreen(gameId, modeId) {
  const game = GAMES.find(g => g.id === gameId);
  const mode = game?.modes.find(m => m.id === modeId);
  if (!mode) return go('#/home');
  disposeScreen = runLesson(app, {
    game,
    mode,
    lang: settings.lang,
    onExit: () => go(`#/game/${game.id}`),
    onRestart: () => route(),
  });
}

function dictionaryScreen() {
  closeRecorder();
  disposeScreen = closeRecorder;
  const lang = settings.lang;
  let tab = sessionStorage.getItem('afrolinga.dictTab') || 'words';
  let query = '';
  let category = '';
  const list = el('div', { class: 'dict-list' });
  const tabs = el('div', { class: 'seg' });
  const chips = el('div', { class: 'chips' });
  const search = el('input', { class: 'search', type: 'search', placeholder: 'Search English or translation…', 'aria-label': 'Search' });
  const iconFor = item => imageFor(item) || { ...item, emoji: item.emoji || categoryOf(item)?.emoji || '💬' };

  const render = () => {
    const source = tab === 'words' ? db.words : tab === 'phrases' ? db.phrases : db.numbers;
    const q = query.trim().toLowerCase();
    const inLang = source.filter(i => i[lang]);
    const cats = [...new Set(inLang.map(i => i.category).filter(Boolean))].map(id => db.categories.find(c => c.id === id) || { id, en: id });
    if (category && !cats.some(c => c.id === category)) category = '';
    const items = inLang.filter(i => (!category || i.category === category) && (!q || `${i.en} ${i[lang]} ${(i.alt?.[lang] || []).join(' ')}`.toLowerCase().includes(q)));
    tabs.replaceChildren(
      ...['words', 'phrases', 'numbers'].map(t =>
        el('button', { type: 'button', class: tab === t ? 'on' : '', onclick: () => { tab = t; category = ''; sessionStorage.setItem('afrolinga.dictTab', t); render(); } }, t[0].toUpperCase() + t.slice(1)),
      ),
    );
    const chip = (id, label) => el('button', { type: 'button', class: `chip${category === id ? ' on' : ''}`, onclick: () => { category = id; render(); } }, label);
    chips.replaceChildren(...(cats.length > 1 ? [chip('', `All (${inLang.length})`), ...cats.map(c => chip(c.id, `${c.emoji || ''} ${c.en}`.trim()))] : []));
    list.replaceChildren(
      ...(items.length ? items : [null]).map(item =>
        !item
          ? el('p', { class: 'muted center' }, 'Nothing found.')
          : el('div', { class: 'dict-row' },
              tab === 'numbers' ? el('div', { class: 'dict-num' }, String(item.value)) : imageView(iconFor(item), { size: 'xs' }),
              el('div', { class: 'dict-main' },
                el('div', { class: 'dict-target', lang }, item[lang]),
                el('div', { class: 'dict-en' }, item.en),
                item.alt?.[lang]?.length ? el('div', { class: 'dict-alt', lang }, `also: ${item.alt[lang].join(', ')}`) : null,
                (item.examples || []).filter(x => x[lang]).map(x =>
                  el('div', { class: 'dict-example' }, playButton({ ...x, type: 'example' }, lang), el('span', { lang }, x[lang]), el('small', {}, x.en)),
                ),
                el('div', { class: 'dict-audio-controls' },
                  playButton(item, lang, { label: `Play ${langInfo(lang)?.name || lang}: ${item[lang]}` }),
                  recordButton(item, lang),
                ),
              ),
            ),
      ),
    );
  };
  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  shell('dictionary',
    el('header', { class: 'page-head' }, el('h1', {}, '📚 Dictionary')),
    langSwitch(dictionaryScreen),
    el('p', { class: 'muted' }, 'Tap the microphone to choose a recording language, including English. Personal recordings stay on this device and are used in games too.'),
    search, tabs, chips, list);
  render();
}

function statsScreen() {
  const s = computeStats();
  const gameName = id => GAMES.find(g => g.id === id)?.name || id;
  const modeName = (gid, mid) => GAMES.find(g => g.id === gid)?.modes.find(m => m.id === mid)?.name || mid;
  shell(
    'stats',
    el('header', { class: 'page-head' }, el('h1', {}, '📈 Progress')),
    el('div', { class: 'stat-cards' },
      statCard('⏱', formatDuration(s.todayMs), 'Today'),
      statCard('⌛', formatDuration(s.totalMs), 'All time'),
      statCard('📘', s.sessions, 'Lessons'),
      statCard('🔥', s.streak, 'Day streak'),
    ),
    el('h2', { class: 'section-title' }, 'Time per game'),
    el('div', { class: 'table' },
      GAMES.map(g => {
        const p = s.perGame[g.id];
        const graded = p ? p.correct + p.wrong : 0;
        return el('div', { class: 'table-row' },
          el('span', {}, `${g.icon} ${g.name}`),
          el('span', {}, p ? formatDuration(p.ms) : '—'),
          el('span', { class: 'muted' }, p ? `${p.sessions} × · ${graded ? Math.round((p.correct / graded) * 100) : 100}%` : ''));
      }),
    ),
    el('h2', { class: 'section-title' }, 'Recent lessons'),
    s.recent.length
      ? el('div', { class: 'table' },
          s.recent.map(r =>
            el('div', { class: 'table-row' },
              el('span', {}, `${gameName(r.gameId)} · ${modeName(r.gameId, r.mode)}`, el('small', { class: 'muted block' }, `${langInfo(r.lang)?.name || r.lang} · ${new Date(r.startedAt).toLocaleString()}${r.completed ? '' : ' · quit early'}`)),
              el('span', {}, formatDuration(r.durationMs)),
              el('span', { class: 'muted' }, `✅${r.correct} ❌${r.wrong} ⏭${r.skipped}`)),
          ))
      : el('p', { class: 'muted center' }, 'No lessons yet. Time is tracked automatically for every lesson.'),
    el('button', {
      class: 'btn btn-ghost btn-wide danger',
      type: 'button',
      onclick: () => {
        if (confirm('Erase all progress and lesson times?')) {
          clearHistory();
          statsScreen();
        }
      },
    }, 'Reset progress'),
  );
}

function settingsScreen() {
  disposeScreen?.();
  const row = (label, control, help) => el('label', { class: 'setting' }, el('span', { class: 'setting-label' }, label, help ? el('small', {}, help) : null), control);
  const select = (key, options, fmt = v => v) => {
    const s = el('select', { onchange: () => saveSettings({ [key]: Number(s.value) }) }, options.map(v => el('option', { value: v, selected: settings[key] === v }, fmt(v))));
    return s;
  };
  const toggle = key => el('input', { type: 'checkbox', class: 'switch', checked: settings[key], onchange: e => saveSettings({ [key]: e.target.checked }) });
  const volume = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings.volume, onchange: e => { saveSettings({ volume: Number(e.target.value) }); sfx('correct'); } });
  const exportStatus = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const exportButton = el('button', { class: 'btn btn-primary btn-wide', type: 'button', onclick: exportRecordings }, '⬇️ Export personal audio');

  async function exportRecordings() {
    exportButton.disabled = true;
    exportStatus.textContent = 'Preparing recordings…';
    try {
      const clips = await listRecordings();
      if (!clips.length) {
        exportStatus.textContent = 'No personal recordings to export. Record and save audio in the Dictionary first.';
        return;
      }
      const archive = await createRecordingArchive(clips, id => db.items.get(id));
      const url = URL.createObjectURL(archive);
      const link = el('a', { href: url, download: `afrolinga-recordings-${new Date().toISOString().slice(0, 10)}.zip`, hidden: true });
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      exportStatus.textContent = `Download requested for ${clips.length} recording${clips.length === 1 ? '' : 's'}. Your saved recordings have not been changed.`;
    } catch (error) {
      console.error('[AfroLinga] Could not export recordings:', error);
      exportStatus.textContent = `Could not export recordings: ${error.message}`;
    } finally {
      exportButton.disabled = false;
    }
  }

  const offlineBox = el('div', { class: 'settings-group pad' });
  const progress = el('p', { class: 'muted small' }, '');
  const downloadBtn = el('button', { class: 'btn btn-primary btn-wide', type: 'button', onclick: downloadAssets }, '⬇️ Save all audio & images now');
  const installBtn = el('button', { class: 'btn btn-ghost btn-wide', type: 'button', onclick: () => showInstallSheet({ manual: true }) }, '📲 Install AfroLinga on this device');

  async function downloadAssets() {
    downloadBtn.disabled = true;
    const { saved, total, unsupported } = await cacheAssets({
      onProgress: (done, all) => (progress.textContent = `Saving… ${done}/${all}`),
    });
    progress.textContent = unsupported
      ? 'This browser cannot store files for offline use.'
      : `✅ ${saved} of ${total} audio/image files are saved on this device.${total - saved ? ` ${total - saved} haven’t been created yet.` : ''}`;
    downloadBtn.disabled = false;
    renderOffline();
  }

  async function renderOffline() {
    const s = await offlineStatus();
    const item = (ok, label, help) =>
      el('li', { class: ok === true ? 'ok' : ok === false ? 'bad' : 'meh' }, el('span', { class: 'st-icon' }, ok === true ? '✅' : ok === false ? '⚠️' : '➖'), el('span', {}, label, help ? el('small', {}, help) : null));
    const ready = s.secure && s.swActive && s.shellCached;
    installBtn.hidden = s.installed;
    offlineBox.replaceChildren(
      el('p', { class: `offline-summary ${ready ? 'good' : 'warn'}` },
        ready ? '✈️ Ready to use offline' : s.secure ? '⏳ Getting ready for offline use…' : '⚠️ Offline mode is off on this link'),
      el('ul', { class: 'status-list' },
        item(s.secure, 'Secure connection', s.secure ? null : 'Phones only save apps from https:// links (or localhost). Use “npm run serve:phone” or host the app on an https site.'),
        item(s.swActive, 'Offline engine running', s.swActive || !s.secure ? null : 'Reload the page once.'),
        item(s.shellCached, 'App saved on this device'),
        item(s.assetsTotal ? (s.assetsSaved ? true : null) : null, `Audio & images saved: ${s.assetsSaved} of ${s.assetsTotal}`, s.assetsSaved < s.assetsTotal ? 'Files you haven’t created yet are skipped. New ones are saved automatically once a day, or tap the button below.' : null),
        item(s.installed ? true : null, s.installed ? 'Installed as an app' : 'Not installed yet'),
        item(navigator.onLine ? true : null, navigator.onLine ? 'Online' : 'Offline right now'),
      ),
      downloadBtn, progress, installBtn,
    );
  }
  disposeScreen = onPwaChange(renderOffline);
  renderOffline();

  shell(
    'settings',
    el('header', { class: 'page-head' }, el('h1', {}, '⚙️ Settings')),
    el('h2', { class: 'section-title' }, 'Language'),
    langSwitch(settingsScreen),
    el('h2', { class: 'section-title' }, 'Text size'),
    textSizeSwitch(settingsScreen),
    el('h2', { class: 'section-title' }, 'Lessons'),
    el('div', { class: 'settings-group' },
      row('Questions per lesson', select('questionsPerLesson', [5, 10, 15, 20])),
      row('Schulte grid size', select('schulteSize', [3, 4, 5], v => `${v} × ${v}`)),
    ),
    el('h2', { class: 'section-title' }, 'Sound'),
    el('div', { class: 'settings-group' },
      row('Game sound effects', toggle('sfx')),
      row('Auto-play pronunciation', toggle('autoplayAudio'), 'Plays the answer after each question'),
      row('Volume', volume),
    ),
    el('h2', { class: 'section-title' }, 'Offline & install'),
    offlineBox,
    el('h2', { class: 'section-title' }, 'Personal recordings'),
    el('div', { class: 'settings-group pad' },
      el('p', { class: 'muted small' }, 'Download all recordings saved in this browser as a ZIP file. It includes the original audio files and a manifest identifying each word and language. Shared app audio is not included.'),
      exportButton, exportStatus,
    ),
    el('p', { class: 'muted center small' }, `AfroLinga · ${db.words.length} words · ${db.phrases.length} phrases · ${db.numbers.length} numbers`),
  );
}

// ---------- boot ----------

async function boot() {
  try {
    await loadData();
  } catch (err) {
    app.replaceChildren(el('div', { class: 'empty' }, el('h2', {}, 'Could not load lessons'), el('p', {}, err.message)));
    console.error(err);
    return;
  }
  if (!db.languages.some(l => l.code === settings.lang)) saveSettings({ lang: db.languages[0].code });
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('hashchange', route);
  route();
  initPWA();
}

boot();

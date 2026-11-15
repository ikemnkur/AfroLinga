// Settings + lesson history (time tracking) persisted in localStorage.
import { todayKey } from './util.js';

const KEY_SETTINGS = 'afrolinga.settings.v1';
const KEY_HISTORY = 'afrolinga.history.v1';
const KEY_BEST = 'afrolinga.best.v1';
const MAX_HISTORY = 1000;

const DEFAULTS = {
  lang: 'ig',
  questionsPerLesson: 10,
  schulteSize: 4,
  sfx: true,
  autoplayAudio: true,
  volume: 0.8,
  textSize: 'medium',
};

export const TEXT_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const settings = { ...DEFAULTS, ...read(KEY_SETTINGS, {}) };

export function saveSettings(patch) {
  Object.assign(settings, patch);
  write(KEY_SETTINGS, settings);
  if ('textSize' in patch) applyTextSize();
}

export function applyTextSize() {
  const size = TEXT_SIZES.some(s => s.id === settings.textSize) ? settings.textSize : DEFAULTS.textSize;
  document.documentElement.dataset.textSize = size;
}

applyTextSize();

export const getHistory = () => read(KEY_HISTORY, []);

export function addSession(record) {
  const history = getHistory();
  history.push(record);
  write(KEY_HISTORY, history.slice(-MAX_HISTORY));
}

export function clearHistory() {
  localStorage.removeItem(KEY_HISTORY);
  localStorage.removeItem(KEY_BEST);
}

/** Best (lowest) time for a key; returns the previous best and stores the new one if better. */
export function recordBest(key, ms) {
  const best = read(KEY_BEST, {});
  const previous = best[key] ?? null;
  if (previous == null || ms < previous) {
    best[key] = ms;
    write(KEY_BEST, best);
  }
  return previous;
}

export function computeStats(history = getHistory()) {
  const today = todayKey();
  const days = new Set();
  const perGame = {};
  let totalMs = 0;
  let todayMs = 0;
  for (const s of history) {
    totalMs += s.durationMs;
    const day = todayKey(new Date(s.startedAt));
    days.add(day);
    if (day === today) todayMs += s.durationMs;
    const g = (perGame[s.gameId] ||= { ms: 0, sessions: 0, correct: 0, wrong: 0, skipped: 0 });
    g.ms += s.durationMs;
    g.sessions++;
    g.correct += s.correct;
    g.wrong += s.wrong;
    g.skipped += s.skipped;
  }
  let streak = 0;
  const d = new Date();
  if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(todayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { totalMs, todayMs, sessions: history.length, streak, perGame, recent: history.slice(-20).reverse() };
}

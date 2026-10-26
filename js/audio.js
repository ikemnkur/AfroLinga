// Audio: recorded clips first, then device text-to-speech, plus game SFX
// (recorded files if present, otherwise synthesized with Web Audio).
import { db, audioSrc, langInfo } from './data.js';
import { settings } from './store.js';

let ctx = null;
const blobCache = new Map(); // url -> Promise<objectURL | null>
let current = null;

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!ctx && AC) ctx = new AC();
  if (ctx?.state === 'suspended') ctx.resume();
  return ctx;
}

/** Call from a user gesture so mobile browsers allow sound. */
export function unlockAudio() {
  audioCtx();
  window.speechSynthesis?.getVoices();
}

// Fetching into a blob avoids range-request problems with service-worker cached media.
function loadUrl(url) {
  if (!blobCache.has(url)) {
    blobCache.set(
      url,
      fetch(url)
        .then(r => (r.ok ? r.blob() : null))
        .then(b => (b && b.size && !b.type.startsWith('text/') ? URL.createObjectURL(b) : null))
        .catch(() => null),
    );
  }
  return blobCache.get(url);
}

export async function hasRecording(id, lang) {
  const url = audioSrc(id, lang);
  return Boolean(url && (await loadUrl(url)));
}

function findVoice(lang) {
  if (!('speechSynthesis' in window)) return null;
  const tag = (langInfo(lang)?.tts || lang).toLowerCase();
  const base = tag.split('-')[0];
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.lang.toLowerCase().replace('_', '-') === tag) ||
    voices.find(v => v.lang.toLowerCase().split(/[-_]/)[0] === base) ||
    null
  );
}

export const canSpeak = lang => Boolean(findVoice(lang));

function speak(text, lang, slow) {
  const voice = findVoice(lang);
  if (!voice || !text) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = slow ? 0.6 : 0.9;
  u.volume = settings.volume;
  speechSynthesis.speak(u);
  return true;
}

export function stopAudio() {
  current?.pause();
  current = null;
  window.speechSynthesis?.cancel();
}

async function playUrl(url, { slow = false, volume = settings.volume } = {}) {
  const blobUrl = await loadUrl(url);
  if (!blobUrl) return false;
  stopAudio();
  const a = new Audio(blobUrl);
  a.volume = volume;
  a.playbackRate = slow ? 0.7 : 1;
  current = a;
  try {
    await a.play();
    return true;
  } catch {
    return false;
  }
}

/**
 * Say an item (word/phrase/number/example) in a language.
 * Returns 'recording' | 'tts' | false.
 */
export async function say(item, lang, { slow = false } = {}) {
  if (!item) return false;
  const url = audioSrc(item.id, lang);
  if (url && (await playUrl(url, { slow }))) return 'recording';
  return speak(item[lang], lang, slow) ? 'tts' : false;
}

/** True if `say` would produce sound for this item. */
export async function canSay(item, lang) {
  return (await hasRecording(item.id, lang)) || canSpeak(lang);
}

/** Keep only items that can actually be heard; returns [] if none can. */
export async function audible(items, lang, idOf = i => i.id) {
  if (canSpeak(lang)) return items;
  const checks = await Promise.all(items.map(i => hasRecording(idOf(i), lang)));
  return items.filter((_, k) => checks[k]);
}

// ---- Sound effects ----

const SYNTH = {
  correct: [[523.25, 0, 0.1], [783.99, 0.09, 0.2]],
  incorrect: [[233, 0, 0.14, 'square'], [175, 0.12, 0.26, 'square']],
  complete: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.35]],
  match: [[660, 0, 0.07], [990, 0.07, 0.12]],
  flip: [[700, 0, 0.05, 'triangle']],
  tap: [[440, 0, 0.04, 'triangle']],
  skip: [[392, 0, 0.08, 'triangle'], [294, 0.08, 0.12, 'triangle']],
};

function tone(c, freq, start, dur, type = 'sine') {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  const peak = Math.max(0.0002, 0.18 * settings.volume);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export async function sfx(name) {
  if (!settings.sfx) return;
  const url = db.sfx?.[name];
  if (url) {
    const blobUrl = await loadUrl(url);
    if (blobUrl) {
      const a = new Audio(blobUrl);
      a.volume = settings.volume * 0.7;
      a.play().catch(() => {});
      return;
    }
  }
  const c = audioCtx();
  if (!c) return;
  for (const [f, t, d, type] of SYNTH[name] || SYNTH.tap) tone(c, f, t, d, type);
}

if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices());
}

// Small DOM + data helpers shared across the app.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const sample = (arr, n) => shuffle(arr).slice(0, n);

/** Pick from `pool`, preferring items whose id is not in `used`. Marks the pick as used. */
export function pickFresh(pool, used, idOf = x => x.id) {
  if (!pool.length) return null;
  let fresh = pool.filter(x => !used.has(idOf(x)));
  if (!fresh.length) {
    for (const x of pool) used.delete(idOf(x));
    fresh = pool;
  }
  const choice = pick(fresh);
  used.add(idOf(choice));
  return choice;
}

export function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

let toastTimer;
export function toast(message, ms = 2200) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), ms);
}

// ---- Text normalisation for answer checking ----

const EDGE_PUNCT = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

/** Split text into word tokens, trimming punctuation from token edges (keeps n'anya, na-eri intact). */
export function tokenize(text) {
  return String(text || '')
    .normalize('NFC')
    .split(/\s+/)
    .map(t => t.replace(EDGE_PUNCT, ''))
    .filter(Boolean);
}

export const normalize = text => tokenize(String(text).replace(/[’‘`]/g, "'")).join(' ').toLowerCase().normalize('NFC');

/** Remove tone marks and under-dots (ọ→o, ẹ́→e, ṅ→n). */
export const stripMarks = text => normalize(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');

/**
 * Compare a typed answer with the accepted answers.
 * Returns 'exact', 'accents' (right letters, wrong/missing marks) or 'wrong'.
 */
export function compareAnswer(input, accepted) {
  const n = normalize(input);
  if (!n) return 'wrong';
  if (accepted.some(a => normalize(a) === n)) return 'exact';
  const loose = stripMarks(input);
  if (accepted.some(a => stripMarks(a) === loose)) return 'accents';
  return 'wrong';
}

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

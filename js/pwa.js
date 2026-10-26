// PWA plumbing: service worker registration, install prompt, update notice,
// background saving of audio/images, and an offline status report for Settings.
import { el, toast } from './util.js';
import { allAssetUrls } from './data.js';

export const ASSET_CACHE = 'afrolinga-assets-v1';
const KEY_DISMISSED = 'afrolinga.installDismissedAt';
const KEY_ASSET_SYNC = 'afrolinga.assetSyncAt';
const SNOOZE_MS = 7 * 24 * 3600 * 1000;
const SYNC_EVERY_MS = 24 * 3600 * 1000;

let deferredPrompt = null;
let registration = null;
let sheet = null;
const subscribers = new Set();
const notify = () => subscribers.forEach(fn => fn());

/** Re-render hooks (e.g. Settings) when install/offline state changes. */
export function onPwaChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone === true;

export function platform() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export const canPromptInstall = () => Boolean(deferredPrompt);

// ---------- install prompt ----------

function instructions() {
  if (!window.isSecureContext) {
    return el('p', { class: 'install-warn' },
      '⚠️ This link isn’t secure (it starts with http://), so the phone can’t save AfroLinga for offline use. ',
      'Open the https:// link instead (see the README: “npm run serve:phone”).');
  }
  if (platform() === 'ios') {
    return el('ol', { class: 'install-steps' },
      el('li', {}, 'Tap the ', el('b', {}, 'Share'), ' button ', el('span', { class: 'ios-share' }, '⬆︎'), ' in Safari’s toolbar.'),
      el('li', {}, 'Scroll down and tap ', el('b', {}, 'Add to Home Screen'), ' ➕.'),
      el('li', {}, 'Open AfroLinga from your home screen once while online – then it works offline.'));
  }
  if (platform() === 'android') {
    return el('ol', { class: 'install-steps' },
      el('li', {}, 'Open the browser menu ', el('b', {}, '⋮'), '.'),
      el('li', {}, 'Tap ', el('b', {}, 'Install app'), ' or ', el('b', {}, 'Add to Home screen'), '.'));
  }
  return el('p', {}, 'Use the install icon ', el('b', {}, '⊕'), ' in the address bar, or the browser menu → ', el('b', {}, 'Install AfroLinga'), '.');
}

export function closeInstallSheet() {
  sheet?.remove();
  sheet = null;
}

/** Bottom sheet asking the user to install. `manual` = opened from a button (ignores the snooze). */
export function showInstallSheet({ manual = false } = {}) {
  if (isStandalone() || sheet) return;
  if (!manual && Date.now() - Number(localStorage.getItem(KEY_DISMISSED) || 0) < SNOOZE_MS) return;
  if (!manual && /#\/play\//.test(location.hash)) return; // never interrupt a lesson

  const dismiss = () => {
    localStorage.setItem(KEY_DISMISSED, String(Date.now()));
    closeInstallSheet();
  };
  const install = async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    deferredPrompt = null;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    closeInstallSheet();
    if (outcome !== 'accepted') localStorage.setItem(KEY_DISMISSED, String(Date.now()));
    notify();
  };

  sheet = el('div', { class: 'install-backdrop', onclick: e => e.target === sheet && dismiss() },
    el('section', { class: 'install-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'install-title' },
      el('div', { class: 'install-head' },
        el('img', { src: 'icons/icon-192.png', alt: '', width: 56, height: 56 }),
        el('div', {},
          el('h2', { id: 'install-title' }, 'Install AfroLinga'),
          el('p', {}, 'Keep it on your home screen and learn anywhere – even with no internet.'))),
      deferredPrompt && window.isSecureContext ? null : instructions(),
      el('div', { class: 'install-actions' },
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: dismiss }, deferredPrompt ? 'Not now' : 'Got it'),
        deferredPrompt && window.isSecureContext ? el('button', { class: 'btn btn-primary', type: 'button', onclick: install }, '📲 Install') : null)));
  document.body.append(sheet);
}

// ---------- update notice ----------

function showUpdateBanner() {
  if (document.querySelector('.update-banner')) return;
  const banner = el('div', { class: 'update-banner', role: 'status' },
    el('span', {}, '✨ A new version of AfroLinga is ready.'),
    el('button', { class: 'btn btn-small', type: 'button', onclick: () => location.reload() }, 'Refresh'),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Dismiss', onclick: () => banner.remove() }, '✕'));
  document.body.append(banner);
}

// ---------- audio + image caching ----------

/**
 * Save every linked audio/image file into the offline cache.
 * Files that don't exist yet or are empty placeholders are skipped (and retried next time).
 */
export async function cacheAssets({ onProgress, concurrency = 6 } = {}) {
  if (!('caches' in window)) return { saved: 0, total: 0, unsupported: true };
  const urls = allAssetUrls();
  const cache = await caches.open(ASSET_CACHE);
  let saved = 0;
  let done = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const hit = await cache.match(url);
        if (hit && (await hit.blob()).size) saved++;
        else {
          if (hit) await cache.delete(url); // stale empty placeholder
          const res = await fetch(url, { cache: 'no-cache' });
          const type = res.headers.get('content-type') || '';
          // Empty files are placeholders waiting for a recording; skip them.
          if (res.ok && !type.startsWith('text/') && (await res.clone().blob()).size) {
            await cache.put(url, res);
            saved++;
          }
        }
      } catch {
        /* offline or missing */
      }
      onProgress?.(++done, urls.length, saved);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return { saved, total: urls.length };
}

async function backgroundAssetSync() {
  if (!navigator.onLine || !window.isSecureContext) return;
  if (Date.now() - Number(localStorage.getItem(KEY_ASSET_SYNC) || 0) < SYNC_EVERY_MS) return;
  await cacheAssets({ concurrency: 3 });
  localStorage.setItem(KEY_ASSET_SYNC, String(Date.now()));
  notify();
}

// ---------- status ----------

export async function offlineStatus() {
  const status = {
    secure: window.isSecureContext,
    swSupported: 'serviceWorker' in navigator,
    swActive: Boolean(navigator.serviceWorker?.controller),
    shellCached: false,
    assetsSaved: 0,
    assetsTotal: allAssetUrls().length,
    installed: isStandalone(),
    persisted: null,
  };
  if ('caches' in window) {
    const keys = await caches.keys();
    status.shellCached = keys.some(k => k.startsWith('afrolinga-shell-'));
    if (keys.includes(ASSET_CACHE)) status.assetsSaved = (await (await caches.open(ASSET_CACHE)).keys()).length;
  }
  status.persisted = (await navigator.storage?.persisted?.()) ?? null;
  return status;
}

// ---------- boot ----------

export function initPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
    // Upgrade an open "how to install" sheet to the one-tap Install button.
    if (sheet) {
      closeInstallSheet();
      showInstallSheet({ manual: true });
    } else setTimeout(() => showInstallSheet(), 2500);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    closeInstallSheet();
    toast('🎉 AfroLinga is installed');
    notify();
  });
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);

  // Phones without an install event (iPhone, Firefox…) or insecure links get instructions instead.
  setTimeout(() => {
    if (!deferredPrompt && !isStandalone() && (platform() !== 'desktop' || !window.isSecureContext)) showInstallSheet();
  }, 6000);

  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    console.warn('[AfroLinga] Offline mode needs https:// or http://localhost – service worker not registered.');
    return;
  }
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBanner();
    else toast('✅ AfroLinga is ready to work offline', 3500);
    notify();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then(reg => {
      registration = reg;
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && registration.update().catch(() => {}));
      return navigator.serviceWorker.ready;
    })
    .then(() => {
      // Ask the browser not to clear our offline data when storage runs low (important on iPhone).
      if (isStandalone()) navigator.storage?.persist?.();
      notify();
      setTimeout(backgroundAssetSync, 3000);
    })
    .catch(err => console.warn('[AfroLinga] Service worker failed', err));
}

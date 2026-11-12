// AfroLinga service worker: precaches the app shell + data, caches assets on use.
// VERSION is set automatically by tools/stamp-sw.mjs (npm run stamp / the dev server);
// it changes whenever an app file changes, so installed apps pick up updates.
const VERSION = 'v-4bcf0b4ae5';
const SHELL_CACHE = `afrolinga-shell-${VERSION}`;
const ASSET_CACHE = 'afrolinga-assets-v1'; // shared with js/app.js "Download for offline"

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/audio.js',
  'js/recordings.js',
  'js/recording-export.js',
  'js/recorder.js',
  'js/components.js',
  'js/data.js',
  'js/lesson.js',
  'js/letters.js',
  'js/pwa.js',
  'js/store.js',
  'js/timer.js',
  'js/util.js',
  'js/games/common.js',
  'js/games/crossword.js',
  'js/games/hangman.js',
  'js/games/image.js',
  'js/games/ispy.js',
  'js/games/math.js',
  'js/games/memory.js',
  'js/games/pairs.js',
  'js/games/picturnary.js',
  'js/games/schulte.js',
  'js/games/sound.js',
  'js/games/unscramble.js',
  'js/games/wordsearch.js',
  'data/languages.json',
  'data/dictionary.json',
  'data/phrases.json',
  'data/numbers.json',
  'data/audio-map.json',
  'data/image-map.json',
  'data/image-audio-map.json',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== ASSET_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Audio + images: cache first, store on first successful use.
  // Empty files are placeholders waiting for a recording, so they're never cached.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(async cached => {
        // An empty cached copy is a stale placeholder: go back to the network for the real file.
        if (cached && (await cached.clone().blob()).size) return cached;
        return fetch(request)
          .then(res => {
            const type = res.headers.get('content-type') || '';
            if (res.ok && !type.startsWith('text/')) {
              const copy = res.clone();
              copy
                .clone()
                .blob()
                .then(b => b.size && caches.open(ASSET_CACHE).then(c => c.put(request, copy)))
                .catch(() => {});
            }
            return res;
          })
          .catch(() => cached || Response.error());
      }),
    );
    return;
  }

  // Page navigations: serve the cached app shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('index.html')));
    return;
  }

  // App shell + data: stale-while-revalidate (instant offline, updates on next launch).
  // 'no-cache' makes the refresh ask the server instead of the browser's HTTP cache.
  const network = fetch(request, { cache: 'no-cache' })
    .then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(request, copy));
      }
      return res;
    })
    .catch(() => null);
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => cached || network.then(r => r || Response.error())));
  event.waitUntil(network);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

const clips = new Map();
let abortNextWrite = false;
let databaseCreated = false;
globalThis.indexedDB = {
  open(name, version) {
    assert.equal(name, 'afrolinga-recordings');
    assert.equal(version, 1);
    const request = {};
    request.result = {
      createObjectStore: name => assert.equal(name, 'clips'),
      transaction(name, mode) {
        assert.equal(name, 'clips');
        const tx = {
          objectStore() {
            const perform = action => {
              const operation = {};
              setTimeout(() => {
                if (mode === 'readwrite' && abortNextWrite) {
                  abortNextWrite = false;
                  tx.error = new Error('Storage quota exceeded');
                  tx.onabort();
                  return;
                }
                operation.result = action();
                tx.oncomplete();
              }, 0);
              return operation;
            };
            return {
              get: key => perform(() => clips.get(key)),
              put: (value, key) => perform(() => clips.set(key, value)),
              delete: key => perform(() => clips.delete(key)),
              openCursor() {
                const request = {};
                const entries = [...clips.entries()];
                let index = 0;
                const next = () => setTimeout(() => {
                  const entry = entries[index++];
                  request.result = entry ? { key: entry[0], value: entry[1], continue: next } : null;
                  request.onsuccess();
                  if (!entry) tx.oncomplete();
                }, 0);
                next();
                return request;
              },
            };
          },
        };
        return tx;
      },
    };
    queueMicrotask(() => {
      if (!databaseCreated) {
        request.onupgradeneeded();
        databaseCreated = true;
      }
      request.onsuccess();
    });
    return request;
  },
};

const { getRecording, saveRecording, deleteRecording, listRecordings } = await import('../js/recordings.js');

test('listing empty recording storage returns an empty list', async () => {
  assert.deepEqual(await listRecordings(), []);
});

test('recordings persist by item and language, replace only their own clip, and can be removed', async () => {
  const english = new Blob(['english'], { type: 'audio/webm' });
  const igbo = new Blob(['igbo'], { type: 'audio/mp4' });
  const replacement = new Blob(['replacement'], { type: 'audio/ogg' });
  assert.equal(await getRecording('w_dog', 'en'), undefined);
  await saveRecording('w_dog', 'en', english);
  await saveRecording('w_dog', 'ig', igbo);
  await saveRecording('w_cat', 'en', english);
  assert.equal(await getRecording('w_dog', 'en'), english);
  assert.equal(await getRecording('w_dog', 'ig'), igbo);
  await saveRecording('w_dog', 'en', replacement);
  assert.equal(await getRecording('w_dog', 'en'), replacement);
  assert.equal(await getRecording('w_dog', 'ig'), igbo);
  await deleteRecording('w_dog', 'en');
  assert.equal(await getRecording('w_dog', 'en'), undefined);
  assert.equal(await getRecording('w_dog', 'ig'), igbo);
  assert.equal(await getRecording('w_cat', 'en'), english);
});

test('empty or invalid recordings cannot overwrite a saved clip', async () => {
  const original = await getRecording('w_cat', 'en');
  await assert.rejects(saveRecording('w_cat', 'en', new Blob([])), /empty/);
  await assert.rejects(saveRecording('w_cat', 'en', null), /empty/);
  assert.equal(await getRecording('w_cat', 'en'), original);
});

test('listing recordings includes all saved languages and preserves audio', async () => {
  const listed = await listRecordings();
  assert.equal(listed.length, clips.size);
  for (const { id, lang, blob } of listed) {
    assert.equal(blob, await getRecording(id, lang));
  }
  assert.ok(listed.some(clip => clip.id === 'w_dog' && clip.lang === 'ig'));
  assert.ok(listed.some(clip => clip.id === 'w_cat' && clip.lang === 'en'));
});

test('failed storage transactions reject instead of reporting success or replacing audio', async () => {
  const original = await getRecording('w_cat', 'en');
  abortNextWrite = true;
  await assert.rejects(saveRecording('w_cat', 'en', new Blob(['new'])), /quota/);
  assert.equal(await getRecording('w_cat', 'en'), original);
});

test('playback and audible filtering prefer personal clips and restore bundled audio after removal', async () => {
  globalThis.localStorage = { getItem: () => null };
  globalThis.window = {};
  const played = [];
  globalThis.Audio = class {
    constructor(url) { this.url = url; }
    async play() { played.push(this); }
    pause() {}
  };
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['bundled'], { type: 'audio/mpeg' }) });
  const { db } = await import('../js/data.js');
  const { say, hasRecording, audible, stopAudio } = await import('../js/audio.js');
  const dog = { id: 'w_dog', en: 'dog', ig: 'nkita' };
  assert.equal(await hasRecording(dog.id, 'ig'), true);
  assert.deepEqual(await audible([dog, { id: 'missing' }], 'ig'), [dog]);
  assert.equal(await say(dog, 'ig', { slow: true }), 'recording');
  assert.equal(played.at(-1).playbackRate, 0.7);
  db.audio.set(dog.id, { ig: 'assets/audio/ig/words/dog.mp3' });
  await deleteRecording(dog.id, 'ig');
  assert.equal(await say(dog, 'ig'), 'recording');
  assert.equal(played.at(-1).playbackRate, 1);
  db.audio.delete(dog.id);
  assert.equal(await say(dog, 'ig'), false);
  stopAudio();
});

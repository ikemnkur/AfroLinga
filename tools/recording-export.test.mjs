import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecordingArchive } from '../js/recording-export.js';

test('exports original audio with matching ZIP headers, CRC, filenames and manifest', async () => {
  const clip = new Blob(['123456789'], { type: 'audio/webm;codecs=opus' });
  const archive = await createRecordingArchive([
    { id: 'w_dog', lang: 'en', blob: clip },
    { id: '../ẹ/word', lang: 'yo', blob: new Blob(['yoruba'], { type: 'audio/mp4' }) },
    { id: 'other', lang: 'ig', blob: new Blob(['unknown'], { type: 'audio/custom' }) },
  ], id => id === 'w_dog' ? { en: 'dog' } : null);
  assert.equal(archive.type, 'application/zip');
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 4);
  const centralOffset = view.getUint32(end + 16, true);
  assert.equal(centralOffset + view.getUint32(end + 12, true), end);
  let directory = centralOffset;
  let local = 0;
  const extracted = new Map();
  for (let i = 0; i < 4; i++) {
    assert.equal(view.getUint32(directory, true), 0x02014b50);
    assert.equal(view.getUint32(directory + 42, true), local);
    assert.equal(view.getUint32(local, true), 0x04034b50);
    assert.equal(view.getUint16(local + 6, true), 0x0800);
    assert.equal(view.getUint16(local + 8, true), 0);
    const size = view.getUint32(local + 18, true);
    assert.equal(size, view.getUint32(local + 22, true));
    assert.equal(size, view.getUint32(directory + 24, true));
    const length = view.getUint16(local + 26, true);
    const filename = new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + length));
    assert.equal(filename, new TextDecoder().decode(bytes.subarray(directory + 46, directory + 46 + length)));
    assert.ok(!filename.split('/').includes('..'));
    const content = bytes.subarray(local + 30 + length, local + 30 + length + size);
    extracted.set(filename, new TextDecoder().decode(content));
    assert.equal(view.getUint32(local + 14, true), view.getUint32(directory + 16, true));
    if (i === 0) assert.equal(view.getUint32(local + 14, true), 0xcbf43926);
    local += 30 + length + size;
    directory += 46 + length;
  }
  assert.equal(local, centralOffset);
  assert.equal(directory, end);
  assert.equal(extracted.get('recordings/1-en-w_dog.webm'), '123456789');
  const manifest = JSON.parse(extracted.get('manifest.json'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.recordings.length, 3);
  assert.deepEqual(manifest.recordings[0], {
    id: 'w_dog', language: 'en', text: 'dog', english: 'dog',
    file: 'recordings/1-en-w_dog.webm', mimeType: 'audio/webm;codecs=opus', bytes: 9,
  });
  assert.ok(manifest.recordings[1].file.endsWith('.m4a'));
  assert.equal(extracted.get(manifest.recordings[1].file), 'yoruba');
  assert.equal(manifest.recordings[1].id, '../ẹ/word');
  assert.ok(manifest.recordings[2].file.endsWith('.bin'));
});

test('empty exports fail explicitly', async () => {
  await assert.rejects(createRecordingArchive([]), /No personal recordings/);
});

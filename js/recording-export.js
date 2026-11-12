// ZIP "stored" entries preserve the browser's original audio without recompression.
const encoder = new TextEncoder();
const extensions = {
  'audio/webm': 'webm', 'video/webm': 'webm',
  'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'application/ogg': 'ogg',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/aac': 'aac',
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function zip(files) {
  if (files.length > 65535) throw new Error('Too many recordings for one ZIP archive.');
  const local = [];
  const central = [];
  let offset = 0;
  let centralSize = 0;
  for (const { name, blob } of files) {
    const filename = encoder.encode(name);
    if (filename.length > 65535 || blob.size >= 0xffffffff || offset + 30 + filename.length + blob.size >= 0xffffffff) {
      throw new Error('The recordings exceed the supported ZIP size (4 GB).');
    }
    const checksum = crc32(new Uint8Array(await blob.arrayBuffer()));
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); // UTF-8 filenames.
    view.setUint16(12, 0x0021, true); // ZIP epoch: 1980-01-01.
    view.setUint32(14, checksum, true);
    view.setUint32(18, blob.size, true);
    view.setUint32(22, blob.size, true);
    view.setUint16(26, filename.length, true);
    local.push(header, filename, blob);

    const entry = new Uint8Array(46);
    const directory = new DataView(entry.buffer);
    directory.setUint32(0, 0x02014b50, true);
    directory.setUint16(4, 20, true);
    entry.set(header.subarray(4, 30), 6);
    directory.setUint32(42, offset, true);
    central.push(entry, filename);
    centralSize += entry.length + filename.length;
    offset += header.length + filename.length + blob.size;
  }
  if (offset + centralSize >= 0xffffffff) throw new Error('The recordings exceed the supported ZIP size (4 GB).');
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}

export async function createRecordingArchive(clips, itemFor = () => null) {
  if (!clips.length) throw new Error('No personal recordings are saved on this browser yet.');
  const manifest = [];
  const files = clips.map(({ id, lang, blob }, index) => {
    const extension = extensions[blob.type.split(';')[0].trim().toLowerCase()] || 'bin';
    const name = `recordings/${index + 1}-${encodeURIComponent(lang)}-${encodeURIComponent(id)}.${extension}`;
    const item = itemFor(id);
    manifest.push({ id, language: lang, text: item?.[lang] || null, english: item?.en || null, file: name, mimeType: blob.type, bytes: blob.size });
    return { name, blob };
  });
  files.push({
    name: 'manifest.json',
    blob: new Blob([JSON.stringify({ version: 1, recordings: manifest }, null, 2)], { type: 'application/json' }),
  });
  return zip(files);
}

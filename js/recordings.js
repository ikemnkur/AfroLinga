// Personal recordings stay in IndexedDB, separate from the shared audio assets.
let database;

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('afrolinga-recordings', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('clips');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Recording storage is blocked. Close other AfroLinga tabs and try again.'));
    }).catch(error => {
      database = null;
      throw error;
    });
  }
  return database;
}

async function transaction(id, lang, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('clips', mode);
    const request = action(tx.objectStore('clips'), JSON.stringify([id, lang]));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error || request.error || new Error('Recording storage was interrupted.'));
    tx.onerror = () => reject(tx.error || request.error);
  });
}

export const getRecording = (id, lang) => transaction(id, lang, 'readonly', (store, key) => store.get(key));
export const saveRecording = (id, lang, blob) => {
  if (!(blob instanceof Blob) || !blob.size) return Promise.reject(new Error('The recording is empty. Please try again.'));
  return transaction(id, lang, 'readwrite', (store, key) => store.put(blob, key));
};
export const deleteRecording = (id, lang) => transaction(id, lang, 'readwrite', (store, key) => store.delete(key));

export async function listRecordings() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('clips', 'readonly');
    const request = tx.objectStore('clips').openCursor();
    const clips = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      try {
        const [id, lang] = JSON.parse(cursor.key);
        if (typeof id !== 'string' || typeof lang !== 'string' || !(cursor.value instanceof Blob) || !cursor.value.size) {
          throw new Error('Invalid saved recording.');
        }
        clips.push({ id, lang, blob: cursor.value });
        cursor.continue();
      } catch (error) {
        reject(error);
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(clips);
    tx.onabort = () => reject(tx.error || request.error || new Error('Reading recordings was interrupted.'));
    tx.onerror = () => reject(tx.error || request.error);
  });
}

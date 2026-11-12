import { el, toast } from './util.js';
import { db, langInfo } from './data.js';
import { stopAudio } from './audio.js';
import { playButton } from './components.js';
import { getRecording, saveRecording, deleteRecording } from './recordings.js';

let closeActive = null;
export const closeRecorder = () => closeActive?.();

export function recordButton(item, lang) {
  return el('button', {
    type: 'button', class: 'play-btn record-btn',
    'aria-label': `Record audio: ${item.en}`,
    title: 'Record audio', 'aria-haspopup': 'dialog',
    onclick: () => openRecorder(item, lang),
  }, '🎤');
}

function openRecorder(item, lang) {
  closeRecorder();
  stopAudio();
  const name = langInfo(lang)?.name || lang;
  let stream = null;
  let recorder = null;
  let blob = null;
  let previewUrl = null;
  let timer = null;
  let closed = false;
  let failed = false;
  const status = el('p', { role: 'status', 'aria-live': 'polite' }, 'Loading recording…');
  const preview = el('audio', { controls: true, hidden: true });
  const start = el('button', { type: 'button', class: 'btn', disabled: true, onclick: capture }, 'Start recording');
  const stop = el('button', { type: 'button', class: 'btn', disabled: true, onclick: () => finish() }, 'Stop recording');
  const save = el('button', { type: 'button', class: 'btn', disabled: true, onclick: persist }, 'Save recording');
  const remove = el('button', { type: 'button', class: 'btn', hidden: true, onclick: erase }, 'Remove saved recording');
  const cancel = el('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel');
  const language = el('select', {
    id: 'record-language',
    onchange: () => openRecorder(item, language.value),
  }, [db.base, ...db.languages].filter(info => info && item[info.code]).map(info =>
    el('option', { value: info.code, selected: info.code === lang }, info.name),
  ));
  const playback = playButton(item, lang, { label: `Play ${name}: ${item[lang]}` });
  const dialog = el('dialog', { class: 'record-dialog', 'aria-labelledby': 'record-title' },
    el('h2', { id: 'record-title' }, 'Record audio'),
    el('label', { for: 'record-language' }, 'Recording language'),
    language,
    el('div', { class: 'record-word' }, el('p', { lang, class: 'dict-target' }, item[lang]), playback),
    el('p', { class: 'muted' }, 'Saved only on this device. A 2-second countdown helps you get ready. Record up to 60 seconds, preview, then save.'),
    status, preview, el('div', { class: 'record-actions' }, start, stop, save, remove, cancel),
  );
  const release = () => {
    clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  };
  function showPreview(clip) {
    preview.pause();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(clip);
    preview.src = previewUrl;
    preview.hidden = false;
  }
  function error(message, cause) {
    console.error('[AfroLinga] Recording:', cause);
    status.textContent = message;
  }
  function close() {
    if (closed) return;
    closed = true;
    stopAudio();
    if (recorder?.state === 'recording') recorder.stop();
    release();
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    dialog.close();
    dialog.remove();
    window.removeEventListener('pagehide', close);
    if (closeActive === close) closeActive = null;
  }
  function finish() {
    if (recorder?.state !== 'recording') return;
    stop.disabled = true;
    status.textContent = 'Preparing preview…';
    recorder.stop();
  }
  async function capture() {
    start.disabled = true;
    language.disabled = playback.disabled = true;
    remove.disabled = true;
    save.disabled = true;
    preview.pause();
    preview.hidden = true;
    stopAudio();
    status.textContent = 'Waiting for microphone permission…';
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (closed) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      stream = acquired;
      blob = null;
      failed = false;
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = event => {
        failed = true;
        release();
        stop.disabled = true;
        start.disabled = false;
        language.disabled = playback.disabled = false;
        remove.disabled = false;
        error('Recording failed. Please try again.', event.error);
      };
      recorder.onstop = () => {
        release();
        if (closed || failed) return;
        stop.disabled = true;
        start.disabled = false;
        language.disabled = playback.disabled = false;
        remove.disabled = false;
        blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
        if (!blob.size) {
          error('No audio was captured. Please try again.', new Error('Empty recording'));
          return;
        }
        showPreview(blob);
        save.disabled = false;
        status.textContent = 'Preview your recording, then save or record again.';
      };
      let remaining = 2;
      const countdown = () => {
        if (closed) return;
        if (remaining > 0) {
          status.textContent = `Get ready… Recording starts in ${remaining}…`;
          remaining--;
          timer = setTimeout(countdown, 1000);
          return;
        }
        try {
          recorder.start();
          stop.disabled = false;
          status.textContent = 'Recording… Tap Stop recording when finished.';
          timer = setTimeout(finish, 60000);
        } catch (cause) {
          release();
          start.disabled = false;
          language.disabled = playback.disabled = false;
          remove.disabled = false;
          error(`Could not start recording: ${cause.message}`, cause);
        }
      };
      countdown();
    } catch (cause) {
      release();
      if (closed) return;
      start.disabled = false;
      language.disabled = playback.disabled = false;
      remove.disabled = false;
      error(cause.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser settings and try again.'
        : `Could not start recording: ${cause.message}`, cause);
    }
  }
  async function persist() {
    start.disabled = save.disabled = remove.disabled = cancel.disabled = language.disabled = playback.disabled = true;
    status.textContent = 'Saving…';
    try {
      await saveRecording(item.id, lang, blob);
      toast(`${name} recording saved on this device`);
      close();
    } catch (cause) {
      error(`Could not save recording: ${cause.message}`, cause);
      start.disabled = save.disabled = remove.disabled = cancel.disabled = language.disabled = playback.disabled = false;
    }
  }
  async function erase() {
    start.disabled = save.disabled = remove.disabled = cancel.disabled = language.disabled = playback.disabled = true;
    try {
      await deleteRecording(item.id, lang);
      toast('Personal recording removed. Original playback restored.');
      close();
    } catch (cause) {
      error(`Could not remove recording: ${cause.message}`, cause);
      start.disabled = remove.disabled = cancel.disabled = language.disabled = playback.disabled = false;
      save.disabled = !blob;
    }
  }
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!cancel.disabled) close();
  });
  preview.addEventListener('error', () => {
    if (closed) return;
    save.disabled = true;
    error('This browser could not preview the recording. Try recording again in another browser.', preview.error);
  });
  document.body.append(dialog);
  closeActive = close;
  window.addEventListener('pagehide', close);
  dialog.showModal();
  const supported = window.isSecureContext && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  getRecording(item.id, lang).then(existing => {
    if (closed) return;
    if (existing) {
      showPreview(existing);
      remove.hidden = false;
    }
    start.disabled = !supported;
    status.textContent = !supported
      ? 'Recording requires HTTPS or localhost and a browser with microphone recording support.'
      : existing ? 'A recording is saved. Record again to replace it, or remove it to restore original playback.'
        : 'Tap Start recording and allow microphone access.';
  }).catch(cause => {
    if (!closed) error(`Recording storage is unavailable: ${cause.message}`, cause);
  });
}

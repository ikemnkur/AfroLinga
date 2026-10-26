// Generic lesson runner: header (quit, progress, timer), footer (skip/check),
// feedback sheet, time tracking and the results screen.
import { el, formatClock, formatDuration } from './util.js';
import { LessonTimer } from './timer.js';
import { sfx, stopAudio } from './audio.js';
import { playButton } from './components.js';
import { addSession, settings } from './store.js';

/**
 * Game module contract:
 *   rounds(settings, mode) -> number of rounds in a lesson
 *   prepare(ctx)           -> optional async; return value stored in ctx.state
 *   round(ctx)             -> (async) { kind: 'check'|'board'|'auto', prompt, el, mounted?, unmount?, check? } or null
 *   summary(record, ctx)   -> optional extra lines for the results screen
 *
 * check() returns { correct, almost?, answer?, item?, lang?, note? }.
 * Board rounds report live with ctx.hit() / ctx.miss() and finish with ctx.complete(note).
 * Auto rounds (no Check button) finish themselves with ctx.resolve(result) using the check() result shape.
 * unmount() is called before the next round and when the lesson ends (remove global listeners there).
 */
export function runLesson(root, { game, mode, lang, onExit, onRestart }) {
  const record = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    gameId: game.id,
    mode: mode.id,
    lang,
    startedAt: Date.now(),
    durationMs: 0,
    rounds: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    completed: false,
  };
  const total = Math.max(1, game.rounds(settings, mode.id));
  let index = 0;
  let round = null;
  let answered = false;
  let finished = false;
  let disposed = false;
  let token = 0;

  const timerEl = el('span', { class: 'timer', 'aria-label': 'Lesson time' }, '0:00');
  const timer = new LessonTimer(ms => (timerEl.textContent = formatClock(ms)));
  const fill = el('div', { class: 'progress-fill' });
  const body = el('main', { class: 'lesson-body' });
  const skipBtn = el('button', { class: 'btn btn-ghost', type: 'button', onclick: skip }, 'Skip ⏭');
  const checkBtn = el('button', { class: 'btn btn-primary', type: 'button', disabled: true, onclick: () => check() }, 'Check');
  const footer = el('footer', { class: 'lesson-footer' }, skipBtn, checkBtn);
  const sheet = el('section', { class: 'feedback', 'aria-live': 'assertive' });
  const header = el(
    'header',
    { class: 'lesson-header' },
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quit lesson', onclick: quit }, '✕'),
    el('div', { class: 'progress', role: 'progressbar' }, fill),
    el('span', { class: 'timer-wrap' }, '⏱ ', timerEl),
  );
  root.replaceChildren(el('div', { class: 'lesson' }, header, body, footer, sheet));

  const ctx = {
    lang,
    mode: mode.id,
    settings,
    used: new Set(),
    state: null,
    setReady: ok => (checkBtn.disabled = !ok),
    submit: () => (answered ? next() : !checkBtn.disabled && check()),
    hit: () => record.correct++,
    miss: () => record.wrong++,
    complete: note => showFeedback({ correct: true, board: true, note }),
    resolve: res => showFeedback(res),
  };

  function unmountRound() {
    round?.unmount?.();
    round = null;
  }

  async function showRound() {
    const my = ++token;
    answered = false;
    unmountRound();
    stopAudio();
    sheet.className = 'feedback';
    sheet.replaceChildren();
    footer.hidden = false;
    fill.style.width = `${(index / total) * 100}%`;
    body.replaceChildren(el('div', { class: 'loading' }, 'Loading…'));
    const r = await game.round(ctx);
    if (my !== token || disposed) return;
    round = r;
    if (!round) {
      body.replaceChildren(
        el('div', { class: 'empty' },
          el('p', {}, 'There isn’t enough content for this exercise yet.'),
          el('p', { class: 'muted' }, 'Add more entries (or recordings) to the data files and try again.'),
        ),
      );
      footer.hidden = true;
      return;
    }
    checkBtn.hidden = round.kind !== 'check';
    checkBtn.disabled = true;
    body.replaceChildren(el('h2', { class: 'prompt' }, round.prompt), round.el);
    round.mounted?.();
  }

  function check() {
    if (answered || !round?.check) return;
    showFeedback(round.check());
  }

  function showFeedback(res) {
    if (answered) return;
    answered = true;
    record.rounds++;
    if (!res.board) res.correct ? record.correct++ : record.wrong++;
    sfx(res.board ? 'complete' : res.correct ? 'correct' : 'incorrect');
    footer.hidden = true;
    const title = res.board
      ? '🎉 Board cleared!'
      : res.correct
        ? res.almost ? '👍 Almost! Watch the marks:' : pickPraise()
        : '❌ Correct answer:';
    const answerRow = res.answer
      ? el('div', { class: 'feedback-answer', lang: res.lang || lang },
          res.item ? playButton(res.item, res.lang || lang) : null,
          el('span', {}, res.answer))
      : null;
    const cont = el('button', { class: 'btn btn-primary btn-wide', type: 'button', onclick: next }, 'Continue');
    sheet.replaceChildren(
      el('div', { class: 'feedback-inner' },
        el('h3', {}, title),
        answerRow,
        res.note ? el('p', { class: 'feedback-note' }, res.note) : null,
        cont,
      ),
    );
    sheet.className = `feedback show ${res.correct ? 'good' : 'bad'}`;
    cont.focus({ preventScroll: true });
    if (res.item && settings.autoplayAudio) answerRow?.querySelector('.play-btn')?.click();
  }

  function next() {
    if (!answered) return;
    index++;
    if (index >= total) finish();
    else showRound();
  }

  function skip() {
    if (answered) return;
    record.skipped++;
    sfx('skip');
    showRound();
  }

  function save(completed) {
    if (record.durationMs > 0) return;
    record.durationMs = Math.round(timer.stop());
    record.completed = completed;
    if (record.durationMs >= 1000) addSession(record);
  }

  function finish() {
    finished = true;
    unmountRound();
    stopAudio();
    save(true);
    fill.style.width = '100%';
    sfx('complete');
    const graded = record.correct + record.wrong;
    const accuracy = graded ? Math.round((record.correct / graded) * 100) : 100;
    const extra = game.summary?.(record, ctx) || [];
    root.replaceChildren(
      el('div', { class: 'results' },
        el('div', { class: 'results-badge' }, accuracy >= 80 ? '🏆' : accuracy >= 50 ? '⭐' : '💪'),
        el('h2', {}, 'Lesson complete!'),
        el('p', { class: 'muted' }, `${game.name} · ${mode.name}`),
        el('div', { class: 'stat-cards' },
          statCard('⏱', formatDuration(record.durationMs), 'Time'),
          statCard('🎯', `${accuracy}%`, 'Accuracy'),
          statCard('✅', record.correct, 'Correct'),
          statCard('❌', record.wrong, 'Mistakes'),
          statCard('⏭', record.skipped, 'Skipped'),
        ),
        extra.map(line => el('p', { class: 'results-extra' }, line)),
        el('div', { class: 'results-actions' },
          el('button', { class: 'btn btn-primary btn-wide', type: 'button', onclick: onRestart }, 'Play again'),
          el('button', { class: 'btn btn-ghost btn-wide', type: 'button', onclick: onExit }, 'Back to lessons'),
        ),
      ),
    );
  }

  function quit() {
    dispose();
    onExit();
  }

  /** Called on quit or navigation: stops the timer and saves partial time. */
  function dispose() {
    if (disposed) return;
    disposed = true;
    token++;
    unmountRound();
    stopAudio();
    if (!finished) save(false);
  }

  timer.start();
  (async () => {
    body.replaceChildren(el('div', { class: 'loading' }, 'Loading…'));
    ctx.state = (await game.prepare?.(ctx)) ?? null;
    if (!disposed) showRound();
  })();

  return dispose;
}

export const statCard = (icon, value, label) =>
  el('div', { class: 'stat-card' }, el('div', { class: 'stat-icon' }, icon), el('div', { class: 'stat-value' }, String(value)), el('div', { class: 'stat-label' }, label));

const PRAISE = ['✅ Correct!', '🎉 Great job!', '🔥 Nice!', '👏 Well done!', '💯 Perfect!'];
const pickPraise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

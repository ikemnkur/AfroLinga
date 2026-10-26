// Lesson stopwatch that pauses automatically while the app is in the background.
export class LessonTimer {
  constructor(onTick) {
    this.onTick = onTick;
    this.elapsed = 0;
    this.startedAt = null;
    this.interval = null;
    this.onVisibility = () => (document.hidden ? this.pause() : this.resume());
  }

  start() {
    this.resume();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.interval = setInterval(() => this.onTick?.(this.ms), 250);
    this.onTick?.(0);
  }

  pause() {
    if (this.startedAt != null) {
      this.elapsed += performance.now() - this.startedAt;
      this.startedAt = null;
    }
  }

  resume() {
    if (this.startedAt == null && !document.hidden) this.startedAt = performance.now();
  }

  get ms() {
    return this.elapsed + (this.startedAt != null ? performance.now() - this.startedAt : 0);
  }

  stop() {
    this.pause();
    clearInterval(this.interval);
    document.removeEventListener('visibilitychange', this.onVisibility);
    return this.elapsed;
  }
}

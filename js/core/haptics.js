/**
 * Haptics — Vibration API where it exists (Android), and on iOS 18+ the
 * native <input switch> trick: clicking its label fires a Taptic tick.
 * Both are best effort and silently do nothing elsewhere.
 */
export class Haptics {
  constructor(label) {
    this.label = label;
    this.canVibrate = typeof navigator.vibrate === 'function';
  }

  tick() {
    if (this.canVibrate) {
      navigator.vibrate(8);
      return;
    }
    try { this.label?.click(); } catch { /* not supported */ }
  }

  error() {
    if (this.canVibrate) {
      navigator.vibrate([30, 40, 60]);
      return;
    }
    // Two quick ticks read as a "buzz" on iOS.
    this.tick();
    setTimeout(() => this.tick(), 90);
  }
}

/**
 * Score — points, rounds survived and the stored best.
 * Points per round: 10 base + up to 10 for speed (how much time was left).
 */
const BEST_KEY = 'push.best';

export class Score {
  constructor() {
    this.best = 0;
    try { this.best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* private mode */ }
    this.reset();
  }

  reset() {
    this.points = 0;
    this.rounds = 0;
    this.newBest = false;
  }

  /** @param {number} speed 0…1, fraction of the response window left over */
  award(speed = 0) {
    const pts = 10 + Math.round(Math.max(0, Math.min(1, speed)) * 10);
    this.points += pts;
    this.rounds += 1;
    return pts;
  }

  commit() {
    if (this.points > this.best) {
      this.best = this.points;
      this.newBest = true;
      try { localStorage.setItem(BEST_KEY, String(this.best)); } catch { /* ignore */ }
    }
  }
}

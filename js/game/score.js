/**
 * Score — points and rounds for the current game, plus the stored top 10.
 * Points per round: 10 base + up to 10 for speed (how much time was left).
 */
const LIST_KEY = 'push.highscores';
const OLD_BEST_KEY = 'push.best';
const MAX_ENTRIES = 10;

export class Score {
  constructor() {
    this.list = this._load();
    this.reset();
  }

  get best() {
    return this.list[0]?.points || 0;
  }

  reset() {
    this.points = 0;
    this.rounds = 0;
    this.newBest = false;
    this.rank = 0; // 1-based position in the top 10 after commit, 0 if not listed
  }

  /** @param {number} speed 0…1, fraction of the response window left over */
  award(speed = 0) {
    const pts = 10 + Math.round(Math.max(0, Math.min(1, speed)) * 10);
    this.points += pts;
    this.rounds += 1;
    return pts;
  }

  /** Store the finished game. Returns nothing; read newBest / rank after. */
  commit() {
    if (this.points <= 0) return;
    const previousBest = this.best;
    const entry = { points: this.points, rounds: this.rounds, at: Date.now() };
    this.list.push(entry);
    this.list.sort((a, b) => b.points - a.points || a.at - b.at);
    this.list = this.list.slice(0, MAX_ENTRIES);
    this.rank = this.list.indexOf(entry) + 1;
    this.newBest = this.points > previousBest;
    this._save();
  }

  clear() {
    this.list = [];
    this._save();
  }

  _load() {
    try {
      const list = JSON.parse(localStorage.getItem(LIST_KEY) || 'null');
      if (Array.isArray(list)) return list;
      // Migrate the single best score from the first version.
      const best = Number(localStorage.getItem(OLD_BEST_KEY)) || 0;
      return best ? [{ points: best, rounds: null, at: null }] : [];
    } catch {
      return [];
    }
  }

  _save() {
    try { localStorage.setItem(LIST_KEY, JSON.stringify(this.list)); } catch { /* ignore */ }
  }
}

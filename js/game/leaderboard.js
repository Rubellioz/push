/**
 * Leaderboard — the world ranking on the server (api/scores.php).
 *
 * Each device gets a random player id; the name is chosen by the player.
 * A game asks for a one-time token when it starts and sends it back with the
 * score, which lets the server reject obviously faked results.
 * Every call fails soft: without a connection the game simply plays on.
 */
const API = 'api/scores.php';
const KEY = 'push.player';
const TIMEOUT_MS = 6000;

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class Leaderboard {
  constructor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
    this.id = saved.id || uuid();
    this.name = saved.name || '';
    this._save();

    this.scores = null;   // last known world list
    this.me = null;       // { name, points, rounds, rank } or null
    this.error = '';
    this.token = null;
    this.pending = null;  // finished game waiting for a name: { token, points, rounds }
    this.listeners = new Set();
  }

  get hasName() { return this.name.length > 0; }

  onChange(fn) { this.listeners.add(fn); }

  /** Called when a game starts. */
  async start() {
    this.token = null;
    try {
      const res = await this._post({ action: 'start' });
      this.token = res.token;
    } catch { /* offline: this game just won't be ranked */ }
  }

  /** Called at game over. Returns the world rank, or 0. */
  async submit(points, rounds) {
    const token = this.token;
    this.token = null;
    if (!token || points <= 0) return 0;
    if (!this.hasName) {
      this.pending = { token, points, rounds };
      return 0;
    }
    return this._submit({ token, points, rounds });
  }

  async setName(name) {
    name = name.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!name) return;
    const renamed = this.hasName && name !== this.name;
    this.name = name;
    this._save();
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      await this._submit(p);
    } else if (renamed) {
      try { this._apply(await this._post({ action: 'rename', player: this.id, name })); } catch { /* ignore */ }
    }
    this._emit();
  }

  async refresh() {
    try {
      const res = await this._fetch(`${API}?player=${encodeURIComponent(this.id)}`);
      this._apply(res);
    } catch (e) {
      this.error = e.message || 'offline';
    }
    this._emit();
    return this.scores;
  }

  async _submit({ token, points, rounds }) {
    try {
      const res = await this._post({ action: 'submit', token, player: this.id, name: this.name, points, rounds });
      this._apply(res);
      this._emit();
      return res.me?.rank || 0;
    } catch (e) {
      this.error = e.message || 'offline';
      this._emit();
      return 0;
    }
  }

  _apply(res) {
    if (Array.isArray(res.scores)) this.scores = res.scores;
    this.me = res.me || null;
    this.error = '';
  }

  _post(body) {
    return this._fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async _fetch(url, opts = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, cache: 'no-store', signal: ctl.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  _save() {
    try { localStorage.setItem(KEY, JSON.stringify({ id: this.id, name: this.name })); } catch { /* ignore */ }
  }

  _emit() { this.listeners.forEach((fn) => fn()); }
}

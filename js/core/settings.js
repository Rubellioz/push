/**
 * Settings — small persisted key/value store with change listeners.
 * Falls back to in-memory defaults when localStorage is unavailable.
 */
const KEY = 'push.settings';

const DEFAULTS = {
  sound: true,
  haptics: true,
  dark: false,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try {
      Object.assign(this.values, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch { /* private mode or corrupt value: keep defaults */ }
    this.listeners = new Set();
  }

  get(key) { return this.values[key]; }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
    this.listeners.forEach((fn) => fn(key, value));
  }

  toggle(key) { this.set(key, !this.values[key]); }

  onChange(fn) { this.listeners.add(fn); }
}

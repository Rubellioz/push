/**
 * TimerGroup — every timeout / frame loop belonging to one scope (a round,
 * a transition…) is tracked here, so a single clear() guarantees nothing
 * stale fires after the game changes state.
 */
export class TimerGroup {
  constructor() {
    this._timeouts = new Set();
    this._frames = new Set();
  }

  after(ms, fn) {
    const id = setTimeout(() => {
      this._timeouts.delete(id);
      fn();
    }, ms);
    this._timeouts.add(id);
    return id;
  }

  cancel(id) {
    clearTimeout(id);
    this._timeouts.delete(id);
  }

  /** Calls fn(elapsedMs) every frame until fn returns false or the group is cleared. */
  loop(fn) {
    const start = performance.now();
    const tick = (now) => {
      this._frames.delete(handle.id);
      if (fn(now - start) === false) return;
      handle.id = requestAnimationFrame(tick);
      this._frames.add(handle.id);
    };
    const handle = { id: requestAnimationFrame(tick) };
    this._frames.add(handle.id);
  }

  clear() {
    this._timeouts.forEach(clearTimeout);
    this._frames.forEach(cancelAnimationFrame);
    this._timeouts.clear();
    this._frames.clear();
  }
}

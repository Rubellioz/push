/**
 * InputController — turns raw pointer / touch events into clean onPress /
 * onRelease callbacks.
 *
 * - pointerdown is used (not click), so there is no 300 ms delay and every
 *   finger-down is one tap — this is what makes double / triple taps reliable.
 * - Each pointer is tracked by id so multi-finger taps and cancelled touches
 *   never leave the button stuck down.
 * - Browser gestures (double-tap zoom, pinch, callouts, context menu) are blocked.
 */
export class InputController {
  constructor(target, { onPress, onRelease, onActivate }) {
    this.target = target;
    this.onPress = onPress;
    this.onRelease = onRelease;
    this.onActivate = onActivate; // events iOS accepts as a user gesture (audio unlock)
    this.active = new Set();
    this._bind();
  }

  _bind() {
    const t = this.target;
    const opts = { passive: false };

    t.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button > 0) return;
      e.preventDefault();
      try { t.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.active.add(e.pointerId);
      this.onActivate?.();
      this.onPress(e);
    }, opts);

    const up = (e) => {
      if (!this.active.delete(e.pointerId)) return;
      if (e.type === 'pointerup') this.onActivate?.();
      if (this.active.size === 0) this.onRelease(e);
    };
    t.addEventListener('pointerup', up);
    t.addEventListener('pointercancel', up);
    t.addEventListener('lostpointercapture', up);

    // touchend counts as user activation on iOS; touchstart is cancelled to
    // stop Safari's double-tap-to-zoom and synthetic mouse events.
    t.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    document.addEventListener('touchend', () => this.onActivate?.(), opts);

    // Keyboard (desktop testing / accessibility): Space or Enter.
    // Keys typed into a field or aimed at a menu control are not button presses.
    const isForUi = (e) => !!e.target?.closest?.('input, textarea, select, .panel, .corner');
    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.code !== 'Space' && e.code !== 'Enter') || isForUi(e)) return;
      e.preventDefault();
      this.onActivate?.();
      this.onPress(e);
    });
    window.addEventListener('keyup', (e) => {
      if ((e.code !== 'Space' && e.code !== 'Enter') || isForUi(e)) return;
      e.preventDefault();
      this.onRelease(e);
    });

    // Kill page-level gestures.
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    document.addEventListener('dblclick', (e) => e.preventDefault(), opts);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => {
      if (e.target.closest?.('.panel')) return; // panels may scroll
      e.preventDefault();
    }, opts);
  }
}

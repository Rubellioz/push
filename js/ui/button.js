/**
 * ButtonView — owns everything visual about the button: the press animation,
 * what the face says, the tap-progress dots, the timer ring and the
 * success / failure glow. It knows nothing about game rules.
 */
export class ButtonView {
  constructor(root) {
    this.device = root.querySelector('#device');
    this.button = root.querySelector('#push');
    this.top = root.querySelector('#faceTop');
    this.main = root.querySelector('#faceMain');
    this.sub = root.querySelector('#faceSub');
    this.dots = root.querySelector('#faceDots');
    this.timer = root.querySelector('.timer');
    this.timerBar = root.querySelector('#timerBar');
    this._urgentId = 0;
  }

  /* ----- press animation ----- */
  press() { this.button.classList.add('is-pressed'); }
  release() { this.button.classList.remove('is-pressed'); }

  /* ----- face content ----- */
  /**
   * @param {object} c
   * @param {string} c.main   big centre text
   * @param {'idle'|'command'|'big'} [c.style]
   * @param {string} [c.top]  small line above
   * @param {string} [c.sub]  small line below
   * @param {boolean} [c.hint] make the sub line breathe
   * @param {boolean} [c.danger]
   * @param {boolean} [c.animate]
   */
  show({ main, style = 'idle', top = '', sub = '', hint = false, danger = false, animate = true }) {
    const m = this.main;
    m.textContent = main;
    m.classList.toggle('is-command', style === 'command');
    m.classList.toggle('is-big', style === 'big');
    m.classList.toggle('is-danger', danger);
    this.top.textContent = top;
    this.sub.textContent = sub;
    this.sub.classList.toggle('is-hint', hint);
    this.button.setAttribute('aria-label', [top, main, sub].filter(Boolean).join(' '));
    if (animate) this._replay(m, 'enter');
  }

  setTop(text) { this.top.textContent = text; }

  setSub(text, hint = false) {
    this.sub.textContent = text;
    this.sub.classList.toggle('is-hint', hint);
  }

  setDots(total, filled = 0) {
    if (total <= 1) { this.dots.innerHTML = ''; return; }
    if (this.dots.children.length !== total) {
      this.dots.innerHTML = '<i></i>'.repeat(total);
    }
    [...this.dots.children].forEach((d, i) => d.classList.toggle('on', i < filled));
  }

  /* ----- timer ring ----- */
  startTimer(ms) {
    const bar = this.timerBar;
    clearTimeout(this._urgentId);
    this.timer.classList.remove('is-urgent');
    bar.style.transition = 'none';
    bar.style.strokeDashoffset = '0';
    bar.getBoundingClientRect(); // commit the reset before animating
    bar.style.transition = `stroke-dashoffset ${ms}ms linear`;
    bar.style.strokeDashoffset = '100';
    this.timer.classList.add('is-on');
    this._urgentId = setTimeout(() => this.timer.classList.add('is-urgent'), ms * 0.7);
  }

  freezeTimer() {
    clearTimeout(this._urgentId);
    const bar = this.timerBar;
    const current = getComputedStyle(bar).strokeDashoffset;
    bar.style.transition = 'none';
    bar.style.strokeDashoffset = current;
  }

  hideTimer() {
    clearTimeout(this._urgentId);
    this.timer.classList.remove('is-on', 'is-urgent');
  }

  /* ----- feedback ----- */
  flashGood() { this._replay(this.button, 'flash-good'); }

  flashBad() {
    this._replay(this.button, 'flash-bad');
    this._replay(this.device, 'shake');
  }

  setDead(dead) {
    this.button.classList.toggle('is-dead', dead);
    if (!dead) this.button.classList.remove('flash-bad');
  }

  _replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart CSS animation
    el.classList.add(cls);
  }
}

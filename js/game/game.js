import { TimerGroup } from '../core/timers.js?v=9';
import { CommandGenerator, gapFor } from './commands.js?v=9';
import { createRound } from './rounds.js?v=9';

/**
 * Game — the state machine.
 *
 *   idle ──tap──▶ intro ──▶ playing ⇄ (round / gap) ──fail──▶ dying ──▶ over ──tap──▶ intro
 *
 * Two timer scopes: `flow` for transitions between states and `roundTimers`
 * for whatever the active round scheduled. Both are cleared on every state
 * change, so nothing from a previous game can ever fire into the next one.
 */
const RESTART_LOCK_MS = 1000;
const READY_MS = 700;        // how long READY shows before the count starts
const COUNTDOWN_FROM = 3;
const COUNT_STEP_MS = 650;   // per number

export class Game {
  constructor({ view, sound, haptics, score, caption, onState, onGameStart, onGameOver }) {
    this.onState = onState;
    this.onGameStart = onGameStart;
    this.onGameOver = onGameOver;
    this.view = view;
    this.sound = sound;
    this.haptics = haptics;
    this.score = score;
    this.caption = caption;
    this.commands = new CommandGenerator();
    this.flow = new TimerGroup();
    this.roundTimers = new TimerGroup();
    this.round = null;
    this.state = 'idle';
    this.restartAt = 0;
    this.showIdle();
  }

  get state() { return this._state; }

  set state(value) {
    if (this._state === value) return;
    this._state = value;
    this.onState?.(value);
  }

  /** Playing, or about to: menus stay out of the way. */
  get busy() {
    return this._state === 'intro' || this._state === 'playing' || this._state === 'dying';
  }

  /* ---------- input ---------- */
  press() {
    this.view.press();
    this.sound.press();
    this.haptics.tick();

    switch (this.state) {
      case 'idle':
        this.start();
        break;
      case 'playing':
        this.round?.tap();
        break;
      case 'over':
        if (performance.now() >= this.restartAt) this.start();
        break;
      default:
        break; // intro / dying: the click is felt, but means nothing
    }
  }

  release() {
    this.view.release();
    this.sound.release();
  }

  /* ---------- states ---------- */
  showIdle() {
    this._clearAll();
    this.state = 'idle';
    this.view.setDead(false);
    this.view.hideTimer();
    this.view.setDots(0);
    this.view.show({ main: 'PUSH', animate: false });
    this._caption(this.score.best ? `BEST ${this.score.best}` : '');
  }

  start() {
    this._clearAll();
    this.state = 'intro';
    this.score.reset();
    this.commands.reset();
    this.onGameStart?.();
    this.view.setDead(false);
    this.view.hideTimer();
    this.view.setDots(0);
    this.view.show({ main: 'READY', style: 'command' });
    this._caption('');

    // READY … 3 · 2 · 1 … first command. One beep per number, a higher one on "go".
    let t = READY_MS;
    for (let n = COUNTDOWN_FROM; n >= 1; n--) {
      this.flow.after(t, () => {
        this.view.show({ main: String(n), style: 'big' });
        this.view.pulse();
        this.sound.countdown(false);
      });
      t += COUNT_STEP_MS;
    }
    this.flow.after(t, () => {
      this.sound.countdown(true);
      this._nextRound();
    });
  }

  _nextRound() {
    this.roundTimers.clear();
    this.state = 'playing';
    const spec = this.commands.next(this.score.rounds);
    const round = createRound(spec, {
      view: this.view,
      timers: this.roundTimers,
      hud: this.score.points ? String(this.score.points) : '',
      succeed: (speed) => this.round === round && this._succeed(speed),
      fail: (reason) => this.round === round && this._fail(reason),
    });
    this.round = round;
    round.start();
  }

  _succeed(speed) {
    this.roundTimers.clear();
    this.round = null;
    this.score.award(speed);
    this.view.hideTimer();
    this.view.setDots(0);
    this.view.flashGood();
    this.view.show({ main: '', top: String(this.score.points), animate: false });
    this.sound.success();
    this.flow.after(gapFor(this.score.rounds), () => this._nextRound());
  }

  _fail(reason) {
    this.roundTimers.clear();
    this.round = null;
    this.state = 'dying';
    this.view.freezeTimer();
    this.view.setDots(0);
    this.view.flashBad();
    this.view.setDead(true);
    this.view.show({ main: reason, style: 'command', top: String(this.score.points), danger: true });
    this.sound.fail();
    this.haptics.error();
    this.flow.after(950, () => this._gameOver());
  }

  _gameOver() {
    this.state = 'over';
    this.score.commit();
    this.onGameOver?.({ points: this.score.points, rounds: this.score.rounds });
    const { points, rounds, best, newBest } = this.score;
    this.view.hideTimer();
    this.view.show({
      top: newBest && points > 0 ? 'NEW BEST' : 'GAME OVER',
      main: String(points),
      style: 'big',
      sub: `${rounds} ${rounds === 1 ? 'ROUND' : 'ROUNDS'}${newBest ? '' : `  ·  BEST ${best}`}`,
    });
    this.restartAt = performance.now() + RESTART_LOCK_MS;
    this.flow.after(RESTART_LOCK_MS, () => this._caption('TAP TO PLAY AGAIN', true));
  }

  /** Leaving the app mid-round would be unfair either way: reset quietly. */
  interrupt() {
    if (this.state === 'intro' || this.state === 'playing' || this.state === 'dying') {
      this.showIdle();
    }
    this.view.release();
  }

  _clearAll() {
    this.flow.clear();
    this.roundTimers.clear();
    this.round = null;
  }

  _caption(text, hint = false) {
    if (!this.caption) return;
    this.caption.textContent = text;
    this.caption.classList.toggle('is-hint', hint);
  }
}

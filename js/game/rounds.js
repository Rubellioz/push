/**
 * Round behaviours. Each round receives a spec from the generator and an
 * `api` from the engine:
 *   api.view      ButtonView
 *   api.timers    TimerGroup scoped to this round (cleared by the engine)
 *   api.hud       string for the small line above the command (score)
 *   api.succeed(speed 0…1)
 *   api.fail(reason)
 * A round implements start() and tap().
 */

/** After the last required tap, wait this long for an accidental extra tap. */
const GRACE_MS = 190;

class TapRound {
  constructor(spec, api) {
    this.spec = spec;
    this.api = api;
    this.taps = 0;
    this.done = false;
    this.armed = true;
  }

  start() {
    this._present(this.spec.label);
  }

  _present(label) {
    const { view, timers } = this.api;
    const { count, window } = this.spec;
    view.show({ main: label, style: 'command', top: this.api.hud });
    view.setDots(count, 0);
    view.startTimer(window);
    this.startedAt = performance.now();
    this.deadline = timers.after(window, () => this.api.fail('TOO SLOW'));
  }

  tap() {
    if (!this.armed) return;
    const { view, timers } = this.api;
    this.taps += 1;

    if (this.taps > this.spec.count) {
      this.api.fail('TOO MANY');
      return;
    }
    view.setDots(this.spec.count, this.taps);

    if (this.taps === this.spec.count) {
      timers.cancel(this.deadline);
      view.freezeTimer();
      const used = performance.now() - this.startedAt;
      const speed = 1 - used / this.spec.window;
      timers.after(GRACE_MS, () => this.api.succeed(speed));
    }
  }
}

class AvoidRound {
  constructor(spec, api) {
    this.spec = spec;
    this.api = api;
  }

  start() {
    const { view, timers } = this.api;
    view.show({ main: this.spec.label, style: 'command', top: this.api.hud });
    view.setDots(0);
    view.startTimer(this.spec.window);
    timers.after(this.spec.window, () => this.api.succeed(0.5));
  }

  tap() {
    this.api.fail('YOU TAPPED');
  }
}

/** "WAIT" with no visible timer, then "NOW" — a pure reaction test. */
class WaitRound extends TapRound {
  constructor(spec, api) {
    super(spec, api);
    this.armed = false;
  }

  start() {
    const { view, timers } = this.api;
    view.show({ main: 'WAIT', style: 'command', top: this.api.hud });
    view.setDots(0);
    view.hideTimer();
    timers.after(this.spec.hold, () => {
      this.armed = true;
      this._present('NOW');
    });
  }

  tap() {
    if (!this.armed) {
      this.api.fail('TOO EARLY');
      return;
    }
    super.tap();
  }
}

const KINDS = { taps: TapRound, avoid: AvoidRound, wait: WaitRound };

export function createRound(spec, api) {
  const Kind = KINDS[spec.kind];
  if (!Kind) throw new Error(`Unknown round kind: ${spec.kind}`);
  return new Kind(spec, api);
}

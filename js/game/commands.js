/**
 * Command catalogue + generator.
 *
 * To add a command: add an entry here. `kind` selects the round behaviour in
 * rounds.js ('taps' | 'avoid' | 'wait'); `unlock` is the round it can first
 * appear in; `weight` is its relative frequency once unlocked.
 */
export const COMMANDS = [
  { id: 'once',   label: 'TAP ONCE',    kind: 'taps',  count: 1, window: 1500, unlock: 0,  weight: 3 },
  { id: 'double', label: 'DOUBLE TAP',  kind: 'taps',  count: 2, window: 1500, unlock: 0,  weight: 3 },
  { id: 'dont',   label: "DON'T TAP",   kind: 'avoid',           window: 1400, unlock: 2,  weight: 2 },
  { id: 'triple', label: 'TRIPLE TAP',  kind: 'taps',  count: 3, window: 2000, unlock: 5,  weight: 2.2 },
  { id: 'now',    label: 'TAP NOW',     kind: 'taps',  count: 1, window: 950,  unlock: 8,  weight: 1.6 },
  { id: 'wait',   label: 'WAIT',        kind: 'wait',  count: 1, window: 950,  unlock: 11, weight: 1.6 },
  { id: 'five',   label: 'TAP 5 TIMES', kind: 'taps',  count: 5, window: 2500, unlock: 14, weight: 1.4 },
];

/** Difficulty curve: 1.0 at the start, easing toward 0.55. */
export function speedFactor(round) {
  return Math.max(0.55, Math.pow(0.984, round));
}

/** Pause between rounds — shrinks with difficulty, gets jittery later on. */
export function gapFor(round) {
  const base = Math.max(280, 650 * speedFactor(round));
  const jitter = round > 18 ? (Math.random() - 0.5) * 220 : 0;
  return Math.round(base + jitter);
}

export class CommandGenerator {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.history = [];
  }

  reset() { this.history = []; }

  /** @returns a concrete round spec: { id, label, kind, count, window, hold? } */
  next(round) {
    const pool = COMMANDS.filter((c) => c.unlock <= round);
    const last = this.history.at(-1);
    const prev = this.history.at(-2);

    const weighted = pool.map((c) => {
      let w = c.weight;
      // Newly unlocked commands show up quickly so players learn them.
      if (round - c.unlock < 2 && !this.history.includes(c.id)) w *= 4;
      // Never the same command three times in a row.
      if (c.id === last && c.id === prev) w = 0;
      // Later on, flatten the odds so sequences feel less predictable.
      if (round > 20) w = Math.sqrt(w);
      return { c, w };
    });

    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = this.rng() * total;
    let pick = weighted[0].c;
    for (const { c, w } of weighted) {
      if ((r -= w) <= 0) { pick = c; break; }
    }

    this.history.push(pick.id);
    if (this.history.length > 8) this.history.shift();
    return this._build(pick, round);
  }

  _build(c, round) {
    const s = speedFactor(round);
    const spec = { id: c.id, label: c.label, kind: c.kind, count: c.count || 0 };

    if (c.kind === 'avoid') {
      // Holding still is easy; it shortens only a little, with some randomness.
      spec.window = Math.round(c.window * (0.75 + 0.25 * s) * (0.85 + this.rng() * 0.3));
    } else {
      // Never below what a human can physically do: ~160 ms per tap + reaction.
      const floor = c.count * 160 + 450;
      spec.window = Math.round(Math.max(floor, c.window * s));
    }

    if (c.kind === 'wait') {
      spec.hold = Math.round(700 + this.rng() * (1100 + 400 * (1 - s)));
    }
    return spec;
  }
}

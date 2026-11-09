/**
 * SoundEngine — every sound is synthesised with the Web Audio API, so there
 * are no files to load and no latency from decoding.
 *
 * iOS Safari only lets an AudioContext start inside a user-activation event
 * (touchend / pointerup for touch), so unlock() is called on both press and
 * release; the very first press may be silent, every later one is instant.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.bus = null;
    this.noise = null;
    this._lastPress = null;
    this._lastPressAt = 0;
  }

  _init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC({ latencyHint: 'interactive' });

    // Gentle bus compression keeps rapid tapping from stacking into harshness.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.001;
    comp.release.value = 0.08;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    comp.connect(master).connect(ctx.destination);

    // Shared white-noise buffer for click transients.
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.bus = comp;
    this.noise = buf;
    return true;
  }

  unlock() {
    if (!this._init()) return;
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
      // A silent one-sample buffer is the classic iOS kick-start.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  _voice(level = 1) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.bus);
    return g;
  }

  _env(param, t, peak, attack, decay) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _noiseBurst(out, t, { freq, q = 1, gain, decay, type = 'bandpass' }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g.gain, t, gain, 0.0008, decay);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + decay + 0.01);
  }

  _tone(out, t, { type = 'sine', from, to = from, glide = 0.05, gain, attack = 0.002, decay }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + glide);
    const g = this.ctx.createGain();
    this._env(g.gain, t, gain, attack, decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.02);
  }

  /** The main tactile "thock": a deep body thump plus a short mechanical tick. */
  press() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.001;

    // Fast repeated taps: duck the previous voice instead of letting them pile up.
    if (this._lastPress && t - this._lastPressAt < 0.12) {
      const p = this._lastPress.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(0, t + 0.006);
    }
    const out = this._voice(1);
    this._lastPress = out;
    this._lastPressAt = t;

    const pitch = 1 + (Math.random() - 0.5) * 0.05; // tiny variation so it never sounds looped
    this._tone(out, t, { from: 165 * pitch, to: 58, glide: 0.06, gain: 0.85, decay: 0.085 });
    this._tone(out, t, { type: 'triangle', from: 520 * pitch, to: 300, glide: 0.02, gain: 0.12, decay: 0.03 });
    this._noiseBurst(out, t, { freq: 2600 * pitch, q: 0.9, gain: 0.55, decay: 0.018 });
    this._noiseBurst(out, t, { freq: 900, q: 0.7, gain: 0.25, decay: 0.03 });
  }

  /** Softer, higher click as the button springs back. */
  release() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.001;
    const out = this._voice(0.55);
    this._noiseBurst(out, t, { freq: 4200, q: 1.2, gain: 0.3, decay: 0.012 });
    this._tone(out, t, { from: 240, to: 150, glide: 0.02, gain: 0.18, decay: 0.03 });
  }

  /** Small warm two-note confirmation, quiet enough to sit under the click. */
  success() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.04;
    const out = this._voice(0.22);
    this._tone(out, t, { from: 784, gain: 0.5, attack: 0.004, decay: 0.22 });
    this._tone(out, t + 0.06, { from: 1175, gain: 0.35, attack: 0.004, decay: 0.28 });
  }

  /** Low falling buzz for a mistake. */
  fail() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const out = this._voice(0.5);
    lp.connect(out);
    this._tone(lp, t, { type: 'sawtooth', from: 190, to: 70, glide: 0.4, gain: 0.5, attack: 0.005, decay: 0.45 });
    this._tone(lp, t, { type: 'sawtooth', from: 196, to: 72, glide: 0.4, gain: 0.4, attack: 0.005, decay: 0.45 });
    this._tone(out, t, { from: 90, to: 45, glide: 0.2, gain: 0.7, decay: 0.25 });
  }
}

/**
 * Ambient "glow" music for the start and game-over screens.
 *
 * Every track is generated live with the Web Audio API (no audio files) and
 * breathes at the same 4.2 s rate as the idle glow animation. Tracks are
 * scheduled ahead on the audio clock, so the same code also renders offline
 * (OfflineAudioContext) for previews.
 *
 * Track interface: start(t0), schedule(untilTime), stop(t).
 */
const BREATH = 4.2;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function impulse(ctx, seconds = 4.5, decay = 2.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { // soft brown-ish noise
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

/** dry + reverb send into dest; returns the input node */
function space(ctx, dest, { dry = 0.55, wet = 0.6, seconds = 4.5 } = {}) {
  const input = ctx.createGain();
  const d = ctx.createGain(); d.gain.value = dry;
  const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, seconds);
  const w = ctx.createGain(); w.gain.value = wet;
  input.connect(d).connect(dest);
  input.connect(conv).connect(w).connect(dest);
  return input;
}

class Track {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.sustained = [];
    this.next = 0;
  }
  osc(type, freq, gain, out, t) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(out);
    o.start(t);
    return o;
  }
  lfo(rate, depth, param, t, phase = 0) {
    const o = this.ctx.createOscillator();
    o.frequency.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start(t - phase / rate);
    this.sustained.push(o);
  }
  schedule() {}
  stop(t) {
    this.sustained.forEach((n) => { try { n.stop(t); } catch { /* already stopped */ } });
  }
}

/* 1 — HUM: a warm lamp drone; two close sines beat slowly, the level breathes. */
class Hum extends Track {
  start(t) {
    const c = this.ctx;
    const out = space(c, this.dest, { dry: 0.8, wet: 0.35 });
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.8;
    const amp = c.createGain(); amp.gain.value = 0.62;
    lp.connect(amp).connect(out);
    for (const [f, type, g] of [[110, 'sine', 0.34], [110.55, 'sine', 0.34], [165.2, 'sine', 0.12], [55, 'triangle', 0.3], [220.4, 'sine', 0.05]]) {
      this.sustained.push(this.osc(type, f, g, lp, t));
    }
    this.lfo(1 / BREATH, 0.36, amp.gain, t);
    this.lfo(1 / 17, 220, lp.frequency, t);
  }
}

/* 2 — GLASS: slow airy chords in A major, each lasting two breaths. */
class Glass extends Track {
  constructor(ctx, dest) {
    super(ctx, dest);
    this.i = 0;
    this.chords = [[57, 61, 64, 68, 71], [54, 57, 61, 64, 68], [50, 54, 57, 61, 64], [52, 56, 59, 62, 66]];
  }
  start(t) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.5;
    lp.connect(space(this.ctx, this.dest, { dry: 0.45, wet: 0.75, seconds: 5 }));
    this.input = lp;
    this.next = t;
  }
  schedule(until) {
    const len = BREATH * 2;
    while (this.next < until) {
      const t = this.next;
      this.chords[this.i++ % this.chords.length].forEach((n, k) => {
        const f = midi(n);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 2.8 + k * 0.15);
        g.gain.setValueAtTime(0.05, t + len - 0.8);
        g.gain.linearRampToValueAtTime(0, t + len + 3.2);
        g.connect(this.input);
        for (const [type, mul, lvl] of [['sine', 1, 1], ['triangle', 2.003, 0.18]]) {
          const o = this.ctx.createOscillator();
          o.type = type;
          o.frequency.value = f * mul;
          const og = this.ctx.createGain(); og.gain.value = lvl;
          o.connect(og).connect(g);
          o.start(t);
          o.stop(t + len + 3.4);
        }
      });
      this.next += len;
    }
  }
}

/* 3 — CHIMES: sparse glassy bells over a faint drone, scattered in stereo. */
class Chimes extends Track {
  start(t) {
    const c = this.ctx;
    this.room = space(c, this.dest, { dry: 0.5, wet: 0.8, seconds: 5.5 });
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const amp = c.createGain(); amp.gain.value = 0.7;
    lp.connect(amp).connect(this.room);
    this.sustained.push(this.osc('sine', midi(45), 0.09, lp, t), this.osc('sine', midi(52), 0.06, lp, t));
    this.lfo(1 / BREATH, 0.3, amp.gain, t);
    this.notes = [81, 83, 85, 88, 90, 93].map(midi); // A major pentatonic, high
    this.next = t + 0.6;
  }
  schedule(until) {
    while (this.next < until) {
      this._bell(this.next, this.notes[Math.floor(Math.random() * this.notes.length)]);
      this.next += 1.3 + Math.random() * 2.6;
    }
  }
  _bell(t, f) {
    const c = this.ctx;
    let out = this.room;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = (Math.random() * 2 - 1) * 0.6;
      p.connect(this.room);
      out = p;
    }
    for (const [ratio, gain, decay] of [[1, 0.16, 2.8], [2.76, 0.05, 1.2], [5.4, 0.02, 0.6]]) {
      const o = c.createOscillator();
      o.frequency.value = f * ratio;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }
}

/* 4 — PULSE: one deep, soft swell per breath with a whisper of air on top. */
class Pulse extends Track {
  start(t) {
    this.room = space(this.ctx, this.dest, { dry: 0.75, wet: 0.45 });
    this.noise = noiseBuffer(this.ctx, 3);
    this.next = t;
  }
  schedule(until) {
    while (this.next < until) {
      this._swell(this.next);
      this.next += BREATH;
    }
  }
  _swell(t) {
    const c = this.ctx;
    const env = (g, peak) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 1.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + BREATH - 0.05);
    };
    const body = c.createGain(); env(body, 0.42); body.connect(this.room);
    for (const [f, lvl] of [[55, 1], [82.41, 0.45], [110, 0.15]]) {
      const o = c.createOscillator(); o.frequency.value = f;
      const g = c.createGain(); g.gain.value = lvl;
      o.connect(g).connect(body); o.start(t); o.stop(t + BREATH);
    }
    const air = c.createBufferSource(); air.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 750; bp.Q.value = 0.6;
    const ag = c.createGain(); env(ag, 0.09);
    air.connect(bp).connect(ag).connect(this.room); air.start(t); air.stop(t + BREATH);
    const glint = c.createOscillator(); glint.frequency.value = midi(88);
    const gg = c.createGain(); env(gg, 0.012);
    glint.connect(gg).connect(this.room); glint.start(t); glint.stop(t + BREATH);
  }
}

// level: loudness trim so every track sits around -27 dBFS RMS
export const TRACKS = {
  hum: { label: 'HUM', Track: Hum, level: 0.38 },
  glass: { label: 'GLASS', Track: Glass, level: 2.1 },
  chimes: { label: 'CHIMES', Track: Chimes, level: 2.45 },
  pulse: { label: 'PULSE', Track: Pulse, level: 1.53 },
};

/** Render a track into any (offline) context, e.g. for previews. */
export function renderInto(ctx, id, seconds, { fadeIn = 2.5, volume = 0.5 } = {}) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(volume * TRACKS[id].level, fadeIn);
  master.gain.setValueAtTime(volume * TRACKS[id].level, seconds - 2);
  master.gain.linearRampToValueAtTime(0, seconds);
  master.connect(ctx.destination);
  const track = new TRACKS[id].Track(ctx, master);
  track.start(0.01);
  track.schedule(seconds);
  track.stop(seconds);
}

/**
 * MusicEngine — plays the chosen track while it's wanted (start / game-over
 * screen), fading in and out. Shares the AudioContext of the SoundEngine.
 */
export class MusicEngine {
  constructor(sound, { volume = 0.5 } = {}) {
    this.sound = sound;
    this.volume = volume;
    this.trackId = 'off';
    this.wanted = false;
    this.current = null;
    this._hooked = false;
  }

  setTrack(id) {
    if (id === this.trackId) return;
    this.trackId = TRACKS[id] ? id : 'off';
    this._fadeOut(0.5);
    this.ensure();
  }

  setWanted(on) {
    this.wanted = on;
    if (on) this.ensure();
    else this._fadeOut(0.7);
  }

  /** Start if everything allows it; safe to call often. */
  ensure() {
    const ctx = this.sound.ctx;
    if (ctx && !this._hooked) {
      this._hooked = true;
      ctx.addEventListener?.('statechange', () => this.ensure());
    }
    if (!this.wanted || this.trackId === 'off' || this.current || !this.sound.ready) return;

    const t = ctx.currentTime + 0.05;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(this.volume * TRACKS[this.trackId].level, t + 2.5);
    master.connect(ctx.destination);
    const track = new TRACKS[this.trackId].Track(ctx, master);
    track.start(t);
    track.schedule(t + 3);
    const timer = setInterval(() => track.schedule(ctx.currentTime + 3), 500);
    this.current = { master, track, timer };
  }

  _fadeOut(seconds) {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    clearInterval(cur.timer);
    const ctx = this.sound.ctx;
    const t = ctx.currentTime;
    cur.master.gain.cancelScheduledValues(t);
    cur.master.gain.setValueAtTime(cur.master.gain.value, t);
    cur.master.gain.linearRampToValueAtTime(0, t + seconds);
    cur.track.stop(t + seconds + 0.1);
    setTimeout(() => cur.master.disconnect(), (seconds + 0.3) * 1000);
  }
}

/**
 * Menus — the two corner buttons and the panels they unfold into.
 *   left:  high scores — WORLD (server ranking) and YOU (this device's top 10)
 *   right: settings (name, sound, vibration, dark mode, clear scores)
 * Only one panel is open at a time; tapping outside closes it.
 */

/**
 * Fires fn once per tap: on pointerup for touch (instant and reliable on
 * iOS), with click kept as fallback for keyboard and older browsers.
 */
function onTap(el, fn) {
  let lastPointer = 0;
  el.addEventListener('pointerup', (e) => {
    if (e.button > 0) return;
    lastPointer = performance.now();
    fn(e);
  });
  el.addEventListener('click', (e) => {
    if (performance.now() - lastPointer < 700) return;
    fn(e);
  });
}

const esc = (str) => String(str).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtDate = (ts) => (ts
  ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
  : '');

export class Menus {
  constructor({ settings, score, leaderboard, sound, haptics }) {
    this.settings = settings;
    this.score = score;
    this.board = leaderboard;
    this.sound = sound;
    this.haptics = haptics;
    this.open = null;
    this.tab = 'world';

    const $ = (id) => document.getElementById(id);
    this.scrim = $('scrim');
    this.menus = {
      scores: { btn: $('scoresBtn'), panel: $('scoresPanel') },
      settings: { btn: $('settingsBtn'), panel: $('settingsPanel') },
    };
    this.list = $('scoresList');
    this.empty = $('scoresEmpty');
    this.tabs = [...document.querySelectorAll('.tab[data-tab]')];
    this.nameForm = $('nameForm');
    this.nameInput = $('nameInput');
    this.nameLabel = $('nameLabel');
    this.settingsName = $('settingsName');
    this.clearBtn = $('clearScores');
    this.switches = [...document.querySelectorAll('.switch[data-setting]')];

    this._bind();
    this._syncSwitches();
    this._resetClear();
    this.settingsName.value = this.board.name;
    this.board.onChange(() => {
      if (this.open === 'scores') this.renderScores();
      if (document.activeElement !== this.settingsName) this.settingsName.value = this.board.name;
    });
  }

  _bind() {
    for (const [name, { btn }] of Object.entries(this.menus)) {
      onTap(btn, () => {
        this._feedback();
        this.toggle(name);
      });
    }
    this.scrim.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });

    this.tabs.forEach((t) => onTap(t, () => {
      if (this.tab === t.dataset.tab) return;
      this.tab = t.dataset.tab;
      this._feedback();
      this.renderScores();
      if (this.tab === 'world') this.board.refresh();
    }));

    this.nameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this._saveName(this.nameInput.value);
      this.nameInput.blur();
    });

    const commitSettingsName = () => {
      const v = this.settingsName.value.trim();
      if (v && v !== this.board.name) this._saveName(v);
      else this.settingsName.value = this.board.name;
    };
    this.settingsName.addEventListener('change', commitSettingsName);
    this.settingsName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.settingsName.blur(); }
    });

    this.switches.forEach((sw) => {
      onTap(sw, () => {
        this.settings.toggle(sw.dataset.setting);
        this._feedback();
      });
    });
    this.settings.onChange(() => this._syncSwitches());

    onTap(this.clearBtn, () => {
      if (!this.clearBtn.disabled) this._clearScores();
    });
  }

  toggle(name) {
    if (this.open === name) this.close();
    else this.show(name);
  }

  /** @param {object} [opts] askName: open on WORLD to collect a name for a waiting score */
  show(name, { askName = false } = {}) {
    if (this.open) this._setOpen(this.open, false);
    if (name === 'scores') {
      if (askName) this.tab = 'world';
      this.renderScores();
      if (this.tab === 'world') this.board.refresh();
    }
    this._setOpen(name, true);
    this.open = name;
    document.body.classList.add('menu-open');
  }

  close() {
    if (!this.open) return;
    document.activeElement?.blur?.();
    this._setOpen(this.open, false);
    this.open = null;
    document.body.classList.remove('menu-open');
    this._resetClear();
  }

  _setOpen(name, on) {
    const { btn, panel } = this.menus[name];
    panel.classList.toggle('is-open', on);
    panel.inert = !on;
    btn.setAttribute('aria-expanded', String(on));
    btn.classList.toggle('is-active', on);
  }

  /* ---------- high scores ---------- */
  renderScores() {
    this.tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === this.tab)));
    if (this.tab === 'world') this._renderWorld();
    else this._renderMine();
  }

  _renderWorld() {
    const b = this.board;
    // Name prompt whenever there's no name yet; stronger when a score is waiting for it.
    this.nameForm.hidden = b.hasName;
    this.nameForm.classList.toggle('is-urgent', !!b.pending);
    this.nameLabel.textContent = b.pending
      ? `ENTER YOUR NAME TO RANK YOUR ${b.pending.points}`
      : 'ENTER YOUR NAME TO JOIN THE WORLD RANKING';

    const rows = (b.scores || []).slice(0, 10);
    const meInList = rows.some((r) => r.me);
    let html = rows.map((r, i) => this._row(i + 1, r.name, r.points, r.me)).join('');
    if (html && b.me && !meInList) {
      html += '<li class="score score--gap" aria-hidden="true">···</li>';
      html += this._row(b.me.rank, b.me.name, b.me.points, true);
    }
    this.list.innerHTML = html;
    this.list.hidden = !html;

    this.empty.hidden = !!html;
    if (b.scores === null && !b.error) this.empty.textContent = 'Loading the world ranking…';
    else if (b.scores === null) this.empty.textContent = 'The world ranking is unavailable right now. Check your connection and try again.';
    else this.empty.textContent = 'No world scores yet. Be the first.';
  }

  _renderMine() {
    this.nameForm.hidden = true;
    const list = this.score.list;
    const latest = this.score.rank;
    this.list.innerHTML = list.map((e, i) => `
      <li class="score${i + 1 === latest ? ' is-latest' : ''}">
        <span class="score__rank">${i + 1}</span>
        <span class="score__pts">${e.points}</span>
        <span class="score__meta">${e.rounds != null ? `${e.rounds} R` : ''}${e.rounds != null && e.at ? ' · ' : ''}${fmtDate(e.at)}</span>
      </li>`).join('');
    this.list.hidden = list.length === 0;
    this.empty.hidden = list.length > 0;
    this.empty.textContent = 'No scores on this device yet. Press PUSH to set one.';
  }

  _row(rank, name, points, me) {
    return `
      <li class="score score--world${me ? ' is-latest' : ''}">
        <span class="score__rank">${rank}</span>
        <span class="score__name">${esc(name)}</span>
        <span class="score__pts">${points}</span>
      </li>`;
  }

  async _saveName(value) {
    const name = value.replace(/\s+/g, ' ').trim();
    if (!name) return;
    this._feedback();
    await this.board.setName(name);
    this.settingsName.value = this.board.name;
    this.nameInput.value = '';
    this.renderScores();
  }

  /* ---------- settings ---------- */
  _syncSwitches() {
    this.switches.forEach((sw) => {
      sw.setAttribute('aria-checked', String(!!this.settings.get(sw.dataset.setting)));
    });
  }

  _clearScores() {
    if (!this.clearBtn.classList.contains('is-confirm')) {
      this.clearBtn.classList.add('is-confirm');
      this.clearBtn.textContent = 'TAP AGAIN TO CLEAR';
      this._feedback();
      this._clearTimer = setTimeout(() => this._resetClear(), 3000);
      return;
    }
    this.score.clear();
    this.score.reset();
    this._resetClear();
    this.clearBtn.textContent = 'CLEARED';
    this.clearBtn.disabled = true;
    this.haptics.error();
    document.dispatchEvent(new CustomEvent('push:scores-cleared'));
  }

  _resetClear() {
    clearTimeout(this._clearTimer);
    this.clearBtn.classList.remove('is-confirm');
    this.clearBtn.textContent = 'CLEAR MY DEVICE SCORES';
    this.clearBtn.disabled = this.score.list.length === 0;
  }

  _feedback() {
    this.sound.unlock();
    this.sound.tick();
    this.haptics.tick();
  }
}

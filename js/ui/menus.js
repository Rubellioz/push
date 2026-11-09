/**
 * Menus — the two corner buttons and the panels they unfold into.
 *   left:  high scores (top 10)
 *   right: settings (sound, vibration, dark mode, clear scores)
 * Only one panel is open at a time; tapping outside closes it.
 */
export class Menus {
  constructor({ settings, score, sound, haptics }) {
    this.settings = settings;
    this.score = score;
    this.sound = sound;
    this.haptics = haptics;
    this.open = null;

    this.scrim = document.getElementById('scrim');
    this.menus = {
      scores: { btn: document.getElementById('scoresBtn'), panel: document.getElementById('scoresPanel') },
      settings: { btn: document.getElementById('settingsBtn'), panel: document.getElementById('settingsPanel') },
    };
    this.list = document.getElementById('scoresList');
    this.empty = document.getElementById('scoresEmpty');
    this.clearBtn = document.getElementById('clearScores');
    this.switches = [...document.querySelectorAll('.switch[data-setting]')];

    this._bind();
    this._syncSwitches();
  }

  _bind() {
    for (const [name, { btn }] of Object.entries(this.menus)) {
      btn.addEventListener('click', () => {
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

    this.switches.forEach((sw) => {
      sw.addEventListener('click', () => {
        this.settings.toggle(sw.dataset.setting);
        this._feedback();
      });
    });
    this.settings.onChange(() => this._syncSwitches());

    this.clearBtn.addEventListener('click', () => this._clearScores());
  }

  toggle(name) {
    if (this.open === name) this.close();
    else this.show(name);
  }

  show(name) {
    if (this.open) this._setOpen(this.open, false);
    if (name === 'scores') this.renderScores();
    this._setOpen(name, true);
    this.open = name;
    document.body.classList.add('menu-open');
  }

  close() {
    if (!this.open) return;
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
    const list = this.score.list;
    const latest = this.score.rank;
    this.empty.hidden = list.length > 0;
    this.list.hidden = list.length === 0;
    this.clearBtn.disabled = list.length === 0;

    const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase() : '');
    this.list.innerHTML = list.map((e, i) => `
      <li class="score${i + 1 === latest ? ' is-latest' : ''}">
        <span class="score__rank">${i + 1}</span>
        <span class="score__pts">${e.points}</span>
        <span class="score__meta">${e.rounds != null ? `${e.rounds} R` : ''}${e.rounds != null && e.at ? ' · ' : ''}${fmt(e.at)}</span>
      </li>`).join('');
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
    this.clearBtn.textContent = 'CLEAR HIGH SCORES';
    this.clearBtn.disabled = this.score.list.length === 0;
  }

  _feedback() {
    this.sound.unlock();
    this.sound.tick();
    this.haptics.tick();
  }
}

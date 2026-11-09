import { ButtonView } from './ui/button.js';
import { Menus } from './ui/menus.js';
import { SoundEngine } from './audio/sound.js';
import { Haptics } from './core/haptics.js';
import { InputController } from './core/input.js';
import { Settings } from './core/settings.js';
import { Score } from './game/score.js';
import { Game } from './game/game.js';

const settings = new Settings();
const view = new ButtonView(document);
const sound = new SoundEngine();
const haptics = new Haptics(document.getElementById('hapticLabel'));
const score = new Score();

/* ---------- settings → engine ---------- */
const themeMeta = document.querySelector('meta[name="theme-color"]');

function applyTheme() {
  const dark = settings.get('dark');
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeMeta?.setAttribute('content', dark ? '#171716' : '#e0e0df');
}

function applySettings() {
  sound.enabled = settings.get('sound');
  haptics.enabled = settings.get('haptics');
  applyTheme();
}
applySettings();

settings.onChange((key) => {
  if (key === 'dark' && document.startViewTransition) {
    document.startViewTransition(applySettings);
  } else {
    applySettings();
  }
});

/* ---------- game ---------- */
let menus;
const game = new Game({
  view,
  sound,
  haptics,
  score,
  caption: document.getElementById('caption'),
  onState: (state) => {
    document.body.dataset.state = state;
    // (game itself isn't assigned yet on the first call from the constructor)
    if (state === 'intro' || state === 'playing' || state === 'dying') menus?.close();
  },
});
document.body.dataset.state = game.state;

menus = new Menus({ settings, score, sound, haptics });

document.addEventListener('push:scores-cleared', () => {
  if (game.state === 'idle' || game.state === 'over') game.showIdle();
});

new InputController(document.getElementById('push'), {
  onPress: (e) => {
    // Space/Enter on a focused menu control belongs to that control.
    if (e.type === 'keydown' && (menus.open || document.activeElement?.closest('.corner, .panel'))) return;
    game.press();
  },
  onRelease: () => game.release(),
  onActivate: () => sound.unlock(),
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.interrupt();
});
window.addEventListener('pagehide', () => game.interrupt());

// Offline / installable. Skipped silently where service workers aren't allowed.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Exposed for debugging in the console only.
window.__push = { game, sound, score, settings, menus };

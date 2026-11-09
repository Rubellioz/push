import { ButtonView } from './ui/button.js?v=5';
import { Menus } from './ui/menus.js?v=5';
import { SoundEngine } from './audio/sound.js?v=5';
import { Haptics } from './core/haptics.js?v=5';
import { InputController } from './core/input.js?v=5';
import { Settings } from './core/settings.js?v=5';
import { Score } from './game/score.js?v=5';
import { Game } from './game/game.js?v=5';
import { Leaderboard } from './game/leaderboard.js?v=5';

const settings = new Settings();
const view = new ButtonView(document);
const sound = new SoundEngine();
const haptics = new Haptics(document.getElementById('hapticLabel'));
const score = new Score();
const leaderboard = new Leaderboard();

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
  onGameStart: () => leaderboard.start(),
  onGameOver: async ({ points, rounds }) => {
    const rank = await leaderboard.submit(points, rounds);
    if (game.state !== 'over') return;
    if (rank) {
      view.setSub(`${rounds} ${rounds === 1 ? 'ROUND' : 'ROUNDS'}  ·  WORLD #${rank}`);
    } else if (leaderboard.pending) {
      // First ranked game without a name: ask for one once the result has sunk in.
      setTimeout(() => {
        if (game.state === 'over' && leaderboard.pending && !menus.open) menus.show('scores', { askName: true });
      }, 1400);
    }
  },
  onState: (state) => {
    document.body.dataset.state = state;
    // (game itself isn't assigned yet on the first call from the constructor)
    if (state === 'intro' || state === 'playing' || state === 'dying') menus?.close();
  },
});
document.body.dataset.state = game.state;

menus = new Menus({ settings, score, leaderboard, sound, haptics });

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
  // When a new version takes over, reload once so every file is from the same deploy.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || game.busy) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  });
}

// Exposed for debugging in the console only.
window.__push = { game, sound, score, settings, menus, leaderboard };

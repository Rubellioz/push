import { ButtonView } from './ui/button.js?v=8';
import { Menus } from './ui/menus.js?v=8';
import { SoundEngine } from './audio/sound.js?v=8';
import { MusicEngine } from './audio/music.js?v=8';
import { Haptics } from './core/haptics.js?v=8';
import { InputController } from './core/input.js?v=8';
import { Settings } from './core/settings.js?v=8';
import { Score } from './game/score.js?v=8';
import { Game } from './game/game.js?v=8';
import { Leaderboard } from './game/leaderboard.js?v=8';

const settings = new Settings();
const view = new ButtonView(document);
const sound = new SoundEngine();
const music = new MusicEngine(sound);
let gameState = 'idle';
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

/** Waiting music: only on the start and game-over screens, with sound on. */
function updateMusic() {
  music.setTrack(settings.get('music'));
  music.setWanted(settings.get('sound') && !document.hidden && (gameState === 'idle' || gameState === 'over'));
}

function applySettings() {
  sound.enabled = settings.get('sound');
  haptics.enabled = settings.get('haptics');
  applyTheme();
  updateMusic();
}
applySettings();

settings.onChange((key) => {
  if (key === 'dark' && document.startViewTransition) {
    document.startViewTransition(applySettings);
  } else {
    applySettings();
  }
});

/* ---------- idle ambience ---------- */
// After a few quiet seconds on the start or game-over screen, the glow
// starts to drift and breathe. Any touch stops it.
const IDLE_AFTER_MS = 3500;
let idleTimer = 0;
function armIdle(state) {
  clearTimeout(idleTimer);
  view.setIdle(false);
  if (state === 'idle' || state === 'over') {
    idleTimer = setTimeout(() => view.setIdle(true), IDLE_AFTER_MS);
  }
}
document.addEventListener('pointerdown', () => {
  if (game && (game.state === 'idle' || game.state === 'over')) armIdle(game.state);
}, { capture: true, passive: true });

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
    gameState = state;
    updateMusic();
    armIdle(state);
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
    armIdle(game.state);
    game.press();
  },
  onRelease: () => game.release(),
  onActivate: () => {
    sound.unlock();
    music.ensure();
  },
});

document.addEventListener('push:activate', () => music.ensure());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.interrupt();
  updateMusic();
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
window.__push = { game, sound, music, score, settings, menus, leaderboard };

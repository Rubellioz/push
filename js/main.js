import { ButtonView } from './ui/button.js';
import { SoundEngine } from './audio/sound.js';
import { Haptics } from './core/haptics.js';
import { InputController } from './core/input.js';
import { Score } from './game/score.js';
import { Game } from './game/game.js';

const view = new ButtonView(document);
const sound = new SoundEngine();
const haptics = new Haptics(document.getElementById('hapticLabel'));
const score = new Score();

const game = new Game({
  view,
  sound,
  haptics,
  score,
  caption: document.getElementById('caption'),
});

new InputController(document.getElementById('push'), {
  onPress: () => game.press(),
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
window.__push = { game, sound, score };

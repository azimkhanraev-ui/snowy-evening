import { WinterScene, periodAt } from '../../shared/engine/scene.js';

const api = window.winter.scene;
const canvas = document.getElementById('scene');

let scene;
let state;
let backgroundName = null;

function currentPeriod() {
  return state.settings.period === 'auto' ? periodAt() : state.settings.period;
}

async function loadBackground(name) {
  backgroundName = name;
  if (!name) return scene.set({ background: null });

  const image = new Image();
  image.src = `/background?${encodeURIComponent(name)}`;
  try {
    await image.decode();
    if (backgroundName === name) scene.set({ background: image });
  } catch {
    if (backgroundName === name) scene.set({ background: null }); // fall back to the landscape
  }
}

function apply(next) {
  if (!next) return;
  state = next;
  const { snow, wind, fps, plow, house, lights, background } = state.settings;
  const options = {
    snow, wind, fps, plow, house, lights,
    period: currentPeriod(),
    transparent: state.overlay,
    bottomInset: state.inset,
    maxPixelRatio: 1.25, // sharper is not visible behind icons and costs a lot of GPU
  };

  if (scene) scene.set(options);
  else scene = new WinterScene(canvas, options);

  if (background !== backgroundName) loadBackground(background);
  if (state.running) scene.start();
  else scene.stop();
}

api.onChange(apply);
// Desktop icons and the mouse over them, in this window's pixels.
api.onDesktop((desktop) => {
  if (!scene) return;
  if (desktop.icons) scene.setIcons(desktop.icons);
  if ('pointer' in desktop) scene.setPointer(desktop.pointer);
});
apply(await api.get());

new ResizeObserver(() => scene?.resize()).observe(canvas);
setInterval(() => scene?.set({ period: currentPeriod() }), 30_000);

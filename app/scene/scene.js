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
  const { snow, wind, fps, plow, house, lights, background, windowSnow } = state.settings;
  // 'wallpaper' behind the icons, 'overlay' above everything, or 'front': only the near snow
  // above the windows, while the wallpaper below keeps the far snow.
  const layer = state.layer ?? (state.overlay ? 'overlay' : 'wallpaper');
  const front = layer === 'front';
  const options = {
    snow, wind, fps,
    plow: plow && !front,
    house: house && !front,
    lights: lights && !front,
    cover: !front,
    flakes: front ? 'near' : layer === 'wallpaper' && windowSnow ? 'far' : 'all',
    windowSnow: layer !== 'wallpaper' && windowSnow,
    icons: layer === 'wallpaper',
    period: currentPeriod(),
    transparent: layer !== 'wallpaper',
    bottomInset: state.inset,
    // Sharper is not visible behind icons and costs a lot of GPU; soft flakes above the windows need even less.
    maxPixelRatio: front ? 1 : 1.25,
  };

  if (scene) scene.set(options);
  else scene = new WinterScene(canvas, options);

  if (background !== backgroundName) loadBackground(background);
  if (state.running) scene.start();
  else scene.stop();
}

api.onChange(apply);
// Desktop icons, open windows and the mouse, in this window's pixels.
api.onDesktop((desktop) => {
  if (!scene) return;
  if (desktop.icons) scene.setIcons(desktop.icons);
  if (desktop.windows) scene.setWindows(desktop.windows);
  if ('pointer' in desktop) scene.setPointer(desktop.pointer);
});
apply(await api.get());

new ResizeObserver(() => scene?.resize()).observe(canvas);
setInterval(() => scene?.set({ period: currentPeriod() }), 30_000);

import { WinterScene } from '../../shared/engine/scene.js';
import { motionEnabled, onMotion } from './motion.js';

/** Light snowfall behind the content. */
export function initAmbient() {
  const canvas = document.getElementById('ambient');
  const scene = new WinterScene(canvas, {
    transparent: true,
    plow: false,
    house: false,
    lights: false,
    cover: false,
    snow: 9,
    wind: 4,
    fps: 24,
    maxPixelRatio: 1,
  });
  new ResizeObserver(() => scene.resize()).observe(canvas);

  onMotion(() => {
    canvas.hidden = !motionEnabled();
    if (motionEnabled()) scene.start();
    else scene.stop();
  });
}

import { WinterScene } from '../../shared/engine/scene.js';
import { onLanguage, t } from './i18n.js';
import { motionEnabled, onMotion, toggleMotion } from './motion.js';

export function initDemo() {
  const canvas = document.getElementById('demo-canvas');
  const snow = document.getElementById('snow');
  const wind = document.getElementById('wind');
  const motion = document.getElementById('motion');
  const buttons = document.querySelectorAll('[data-period]');

  // Browsers restore slider positions after a reload, so read them first.
  const scene = new WinterScene(canvas, { period: 'evening', snow: snow.valueAsNumber, wind: wind.valueAsNumber });
  scene.advance(1 / 30);
  scene.render();
  let onScreen = true;

  const updateMotion = () => {
    if (onScreen && motionEnabled()) scene.start();
    else scene.stop();
    motion.textContent = t(motionEnabled() ? 'demo.pause' : 'demo.play');
  };

  const select = (period) => {
    scene.set({ period });
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.period === period));
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      select(button.dataset.period);
      if (button.closest('.period-cards')) {
        canvas.scrollIntoView({ block: 'center', behavior: motionEnabled() ? 'smooth' : 'instant' });
      }
    });
  }
  snow.addEventListener('input', () => scene.set({ snow: snow.valueAsNumber }));
  wind.addEventListener('input', () => scene.set({ wind: wind.valueAsNumber }));
  motion.addEventListener('click', toggleMotion);

  new ResizeObserver(() => scene.resize()).observe(canvas);
  new IntersectionObserver((entries) => {
    onScreen = entries.at(-1).isIntersecting;
    updateMotion();
  }).observe(canvas);

  onMotion(updateMotion);
  onLanguage(updateMotion);
  select('evening');
}

/** Static previews, painted only when the cards get close to the viewport. */
export function initPreviews() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const { isIntersecting, target } of entries) {
        if (!isIntersecting) continue;
        observer.unobserve(target);
        const scene = new WinterScene(target, { period: target.parentElement.dataset.period, snow: 40, houseX: 0.72 });
        new ResizeObserver(() => scene.resize()).observe(target);
      }
    },
    { rootMargin: '300px' },
  );
  for (const canvas of document.querySelectorAll('.period-cards canvas')) observer.observe(canvas);
}

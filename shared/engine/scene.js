import { LIGHT_COLORS, clamp, disc, softDot, surface } from './draw.js';
import { PERIODS } from './periods.js';
import { drawLandscape } from './landscape.js';
import { CHIMNEY, drawHouse, drawHouseLights } from './house.js';
import { BLADE_X, HALF_LENGTH, drawPlow } from './plow.js';
import { SnowCover, Snowfall } from './snow.js';

export { PERIODS, PERIOD_IDS, periodAt } from './periods.js';

const DEFAULTS = {
  period: 'evening',
  snow: 45, // 0..100
  wind: 15, // -100..100, negative blows to the left
  plow: true,
  house: true,
  lights: true,
  fps: 30,
  transparent: false, // overlay: no landscape, only the moving things
  cover: true, // snow settling on the ground
  background: null, // an HTMLImageElement that replaces the painted landscape
  bottomInset: 0, // space hidden behind the taskbar
  houseX: 0.8,
  maxPixelRatio: 1.5,
};

// Options that need the cached background to be painted again.
const REPAINT = ['period', 'house', 'transparent', 'background', 'bottomInset', 'houseX'];
const FADE_SECONDS = 1.2;
const PLOW_SPEED = 78;

export class WinterScene {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.options = { ...DEFAULTS, ...options };
    this.snowfall = new Snowfall();
    this.cover = new SnowCover();
    this.dots = {
      flake: softDot('#f4f9ff', 0.35),
      smoke: softDot('#c5cfe2'),
      warm: softDot('#ffb84d'),
      lights: LIGHT_COLORS.map((color) => softDot(color)),
    };
    this.time = 0;
    this.fade = 0;
    this.truck = { x: 0, direction: 1, wait: 0, distance: 0 };
    this.frameId = 0;
    this.view = null;
    this.resize();
  }

  get running() {
    return this.frameId !== 0;
  }

  set(changes) {
    const changed = Object.keys(changes).filter((key) => changes[key] !== this.options[key]);
    if (!changed.length) return;
    Object.assign(this.options, changes);

    if (changed.includes('bottomInset') || changed.includes('transparent')) this.layout();
    if (changed.some((key) => REPAINT.includes(key))) {
      if (changed.includes('period') && this.running && !this.options.transparent) {
        this.previous = this.still;
        this.fade = FADE_SECONDS;
        this.still = null;
      }
      this.paintStill();
    }
    if (!this.running) {
      if (changed.includes('snow') && this.view) this.snowfall.update(0, this.time, this.view, this.options.snow, 0);
      this.render();
    }
  }

  resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight) {
    if (!width || !height) return;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, this.options.maxPixelRatio);
    const old = this.view;
    if (old?.w === width && old?.h === height && this.ratio === ratio) return;

    this.ratio = ratio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.size = { w: width, h: height };
    this.previous = null;
    this.layout();

    if (old) {
      this.snowfall.resize(width / old.w, height / old.h);
      this.truck.x *= width / old.w;
    } else {
      this.truck.x = width * 0.3;
    }
    this.snowfall.update(0, this.time, this.view, this.options.snow, 0);
    this.still = null;
    this.paintStill();
    this.render();
  }

  layout() {
    if (!this.size) return;
    const { w, h } = this.size;
    const { transparent, bottomInset } = this.options;
    const u = clamp(Math.min(h / 600, w / 560), 0.22, 3);
    const floor = h - bottomInset;
    this.view = {
      w, h, u,
      road: transparent ? floor - 2 : floor - 30 * u,
      ground: transparent ? floor - 2 : floor - 96 * u,
      horizon: floor - 205 * u,
      objectScale: transparent ? u * 0.48 : u,
    };
    this.cover.resize(w, this.view.objectScale);
  }

  housePlace() {
    const { w, ground, objectScale } = this.view;
    const right = w - 175 * objectScale;
    const x = this.options.transparent ? right : Math.min(this.options.houseX * w, right);
    return [x, ground, objectScale];
  }

  paintStill() {
    if (!this.view) return;
    const { w, h } = this.view;
    this.still ??= surface(w * this.ratio, h * this.ratio);
    const g = this.still.getContext('2d');
    g.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    g.clearRect(0, 0, w, h);

    const period = PERIODS[this.options.period];
    if (!this.options.transparent) drawLandscape(g, this.view, period, this.options.background);
    if (this.options.house) {
      const [x, y, scale] = this.housePlace();
      g.translate(x, y);
      g.scale(scale, scale);
      drawHouse(g, period);
    }
  }

  start() {
    if (this.running) return;
    let last = performance.now();
    const tick = (now) => {
      this.frameId = requestAnimationFrame(tick);
      // The tolerance keeps 30 fps from degrading to 20 on a 60 Hz display.
      if (now - last < 1000 / this.options.fps - 4) return;
      this.advance(Math.min((now - last) / 1000, 0.1));
      last = now;
      this.render();
    };
    this.frameId = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  advance(dt) {
    if (!this.view) return;
    const { snow, wind, plow, cover } = this.options;
    this.time += dt;
    this.snowfall.update(dt, this.time, this.view, snow, wind);
    if (cover) this.cover.update(dt, this.view.objectScale, snow);
    if (plow) this.drive(dt);
    if (this.fade > 0) {
      this.fade -= dt;
      if (this.fade <= 0) this.previous = null;
    }
  }

  drive(dt) {
    const truck = this.truck;
    if (truck.wait > 0) {
      truck.wait -= dt;
      return;
    }
    const { w, u, road, objectScale } = this.view;
    const scale = objectScale * 0.9;
    const step = PLOW_SPEED * u * dt;
    const blade = truck.x + truck.direction * BLADE_X * scale;

    truck.x += truck.direction * step;
    truck.distance += step / scale;
    if (this.options.cover) this.cover.clear(blade, blade + truck.direction * step, road, objectScale, truck.direction);

    const margin = HALF_LENGTH * scale + 20;
    if ((truck.direction > 0 && truck.x > w + margin) || (truck.direction < 0 && truck.x < -margin)) {
      truck.direction *= -1;
      truck.wait = 4;
    }
  }

  render() {
    if (!this.view || !this.still) return;
    const { g, dots, time, options } = this;
    const { w, h, road, objectScale } = this.view;
    const period = PERIODS[options.period];

    g.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!options.transparent || options.house) g.drawImage(this.still, 0, 0, w, h);
    if (this.previous) {
      g.globalAlpha = clamp(this.fade / FADE_SECONDS, 0, 1);
      g.drawImage(this.previous, 0, 0, w, h);
      g.globalAlpha = 1;
    }

    if (options.house) {
      const [x, y, scale] = this.housePlace();
      g.save();
      g.translate(x, y);
      g.scale(scale, scale);
      drawHouseLights(g, period, time, dots, options.lights);
      this.drawSmoke();
      g.restore();
    }
    if (options.lights && options.transparent) this.drawTopGarland();

    if (options.cover) this.cover.drawCover(g, road, options.transparent ? '#e6f0fb' : period.snow[0]);
    if (options.plow && this.truck.wait <= 0) {
      const scale = objectScale * 0.9;
      g.save();
      g.translate(this.truck.x, road + 2);
      g.scale(scale * this.truck.direction, scale);
      drawPlow(g, period, time, this.truck.distance, dots);
      g.restore();
    }
    if (options.cover) this.cover.drawSpray(g, dots.flake);
    this.snowfall.draw(g, this.view, dots.flake);
  }

  drawSmoke() {
    const { g, time, dots, options } = this;
    for (let i = 0; i < 7; i++) {
      const age = (time / 4.5 + i / 7) % 1;
      const size = 14 + age * 44;
      const x = CHIMNEY[0] + age * options.wind * 1.1 + Math.sin(age * 7) * 5;
      g.globalAlpha = (1 - age) * 0.75;
      g.drawImage(dots.smoke, x - size / 2, CHIMNEY[1] - age * 95 - size / 2, size, size);
    }
    g.globalAlpha = 1;
  }

  drawTopGarland() {
    const { g, time, dots } = this;
    const { w } = this.view;
    const spans = Math.max(2, Math.round(w / 320));
    const span = w / spans;
    g.beginPath();
    g.moveTo(0, 2);
    for (let i = 0; i < spans; i++) g.quadraticCurveTo((i + 0.5) * span, 34, (i + 1) * span, 2);
    g.strokeStyle = '#24422f';
    g.lineWidth = 1.5;
    g.stroke();

    for (let i = 0; i < spans; i++) {
      for (let j = 1; j < 9; j++) {
        const t = j / 9;
        const x = (i + t) * span;
        const y = 4 + 64 * t * (1 - t);
        const color = (i * 8 + j) % LIGHT_COLORS.length;
        g.globalAlpha = 0.45 + 0.45 * Math.sin(time * 1.6 + i + j * 1.2) ** 2;
        g.drawImage(dots.lights[color], x - 12, y - 12, 24, 24);
        g.globalAlpha = 1;
        disc(g, x, y, 2.8, LIGHT_COLORS[color]);
      }
    }
  }
}

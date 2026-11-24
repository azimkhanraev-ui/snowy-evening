import { CLUMP_TURNS, TAU, clamp } from './draw.js';

const MAX_FLAKES = 1400;
const MAX_SPRAY = 170;
const COLUMN = 5;
const GRAVITY = 320;
// Road snow in scene units: how deep it may get and how fast it grows at 100 % snow.
const COVER_LIMIT = 30;
const COVER_GROWTH = 0.14;

// Most flakes are far away: depth z is spread as random ** DEPTH_SPREAD.
const DEPTH_SPREAD = 1.6;
// Flakes in front of the focus are big, blurred discs.
const BOKEH_FROM = 0.88;
const LAYERS = { all: [0, 1], far: [0, 0.5], near: [0.5, 1] };

/** Share of all flakes whose depth falls inside [from, to]. */
const shareOf = ([from, to]) => to ** (1 / DEPTH_SPREAD) - from ** (1 / DEPTH_SPREAD);

/**
 * Falling snow with depth: far flakes are small, faint and slow, near ones big and fast,
 * a few pass right in front of the viewer out of focus. Each flake sways at its own pace
 * and the wind comes in gusts. `layer` keeps only the far or the near part, so a scene behind
 * the windows and one above them share one snowfall between them.
 */
export class Snowfall {
  flakes = [];

  constructor(layer = 'all') {
    this.layer = layer;
  }

  setLayer(layer) {
    if (layer === this.layer) return;
    this.layer = layer;
    this.flakes.length = 0; // refilled on the next update
  }

  spawn(w, h, anywhere) {
    const [from, to] = LAYERS[this.layer] ?? LAYERS.all;
    const lo = from ** (1 / DEPTH_SPREAD);
    const hi = to ** (1 / DEPTH_SPREAD);
    const z = (lo + Math.random() * (hi - lo)) ** DEPTH_SPREAD;
    const bokeh = z >= BOKEH_FROM;
    const clump = !bokeh && z > 0.45 && Math.random() < 0.3;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -12 - Math.random() * 30,
      z,
      kind: bokeh ? 'bokeh' : clump ? 'clump' : z < 0.3 ? 'sharp' : 'soft',
      sprite: Math.floor(Math.random() * 3),
      size: (1.4 + 8.5 * z ** 1.4) * (0.75 + Math.random() * 0.5) * (bokeh ? 2.2 : clump ? 1.35 : 1),
      fall: (14 + 88 * z) * (0.8 + Math.random() * 0.4) * (clump ? 1.15 : 1),
      sway: 6 + Math.random() * 20,
      pace: 0.5 + Math.random() * 1.3,
      phase: Math.random() * TAU,
      turn: 0,
      spin: (Math.random() - 0.5) * 2.4,
      alpha: bokeh ? 0.28 + Math.random() * 0.2 : 0.3 + 0.65 * z,
    };
  }

  /** `land(flake, previousY)` may catch a flake on a surface; it then starts again at the top. */
  update(dt, time, { w, h, u }, amount, wind, land = null) {
    const range = LAYERS[this.layer] ?? LAYERS.all;
    const wanted = Math.min(MAX_FLAKES, Math.round(((w * h) / 2200) * (amount / 100) * shareOf(range)));
    if (this.flakes.length > wanted) this.flakes.length = wanted;
    while (this.flakes.length < wanted) this.flakes.push(this.spawn(w, h, true));

    const speed = Math.max(u, 0.6);
    // The wind rises and falls in gusts and now and then almost calms down.
    const gust = 1 + 0.55 * Math.sin(time * 0.23) * Math.sin(time * 0.71 + 1.3) + 0.2 * Math.sin(time * 1.9);
    const margin = 40;
    for (const f of this.flakes) {
      const before = f.y;
      const flutter = 1 + 0.18 * Math.sin(time * f.pace * 1.7 + f.phase);
      f.y += f.fall * flutter * speed * dt;
      const drift = wind * 2.4 * (0.35 + 0.8 * f.z) * gust;
      const eddy = 10 * Math.sin(f.y * 0.011 + time * 0.8 + f.phase);
      f.x += (drift + eddy + f.sway * Math.sin(time * f.pace + f.phase)) * speed * dt;
      if (f.kind === 'clump') f.turn += f.spin * dt;

      if (f.y > h + margin || (land && f.y > 0 && land(f, before))) {
        Object.assign(f, this.spawn(w, h, false));
        // In a strong wind new flakes also come in from the side it blows from.
        if (Math.abs(wind) > 20 && Math.random() < 0.35) {
          f.x = wind > 0 ? -Math.random() * margin : w + Math.random() * margin;
          f.y = Math.random() * h * 0.6;
        }
      }
      if (f.x < -margin) f.x += w + margin * 2;
      else if (f.x > w + margin) f.x -= w + margin * 2;
    }
  }

  resize(scaleX, scaleY) {
    for (const f of this.flakes) {
      f.x *= scaleX;
      f.y *= scaleY;
    }
  }

  draw(g, { u }, sprites) {
    const scale = Math.max(u, 0.6);
    for (const f of this.flakes) {
      const size = f.size * scale;
      g.globalAlpha = f.alpha;
      const picture = f.kind === 'clump'
        ? sprites.clumps[f.sprite][(((Math.round((f.turn / TAU) * CLUMP_TURNS)) % CLUMP_TURNS) + CLUMP_TURNS) % CLUMP_TURNS]
        : sprites[f.kind];
      g.drawImage(picture, f.x - size / 2, f.y - size / 2, size, size);
    }
    g.globalAlpha = 1;
  }
}

/** Snow that settles on the road until the plow pushes it aside. */
export class SnowCover {
  heights = new Float32Array(0);
  spray = [];

  resize(width, unit) {
    this.unit = unit;
    this.heights = Float32Array.from(
      { length: Math.ceil(width / COLUMN) + 2 },
      (_, i) => (7 + Math.sin(i * 0.07) * 2 + Math.sin(i * 0.23)) * unit,
    );
    this.spray.length = 0;
  }

  update(dt, u, amount, rate = 1) {
    this.unit = u;
    const limit = COVER_LIMIT * u;
    const growth = (amount / 100) * COVER_GROWTH * rate * u * dt;
    for (let i = 0; i < this.heights.length; i++) {
      this.heights[i] = Math.min(limit, this.heights[i] + growth * (0.7 + 0.3 * Math.sin(i * 0.13) ** 2));
    }
    for (const s of this.spray) {
      s.vy += GRAVITY * u * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.spray = this.spray.filter((s) => s.life > 0);
  }

  /** Average depth in scene units, which decides when the plow is needed. */
  depth() {
    if (!this.heights.length || !this.unit) return 0;
    let sum = 0;
    for (const height of this.heights) sum += height;
    return sum / this.heights.length / this.unit;
  }

  heightAt(x) {
    const i = Math.round(x / COLUMN);
    return i >= 0 && i < this.heights.length ? this.heights[i] : 0;
  }

  /** Piles snow up around x, highest in the middle. */
  add(x, amount) {
    const limit = COVER_LIMIT * (this.unit || 1);
    const radius = 4;
    const middle = Math.round(x / COLUMN);
    for (let i = middle - radius; i <= middle + radius; i++) {
      if (i < 0 || i >= this.heights.length) continue;
      const share = (1 - Math.abs(i - middle) / (radius + 1)) / 3;
      this.heights[i] = Math.min(limit, this.heights[i] + amount * share);
    }
  }

  /** Scoops snow from around x and returns how much was taken. */
  take(x, amount) {
    const middle = Math.round(x / COLUMN);
    let taken = 0;
    for (let i = middle - 3; i <= middle + 3 && taken < amount; i++) {
      if (i < 0 || i >= this.heights.length) continue;
      const part = Math.min(this.heights[i] * 0.5, (amount - taken) / 2);
      this.heights[i] -= part;
      taken += part;
    }
    return taken;
  }

  /** Clears whatever the blade passed over between two frames. */
  clear(from, to, road, u, direction) {
    const last = this.heights.length - 1;
    const start = Math.floor(Math.min(from, to) / COLUMN);
    const end = Math.ceil(Math.max(from, to) / COLUMN);
    if (end < 0 || start > last) return;

    let removed = 0;
    for (let i = clamp(start, 0, last); i <= clamp(end, 0, last); i++) {
      removed += this.heights[i];
      this.heights[i] = 0;
    }
    const count = Math.min(5, Math.ceil(removed / (6 * u)), MAX_SPRAY - this.spray.length);
    for (let i = 0; i < count; i++) {
      this.spray.push({
        x: to,
        y: road - Math.random() * 14 * u,
        vx: direction * (30 + Math.random() * 130) * u,
        vy: -(50 + Math.random() * 120) * u,
        size: (6 + Math.random() * 12) * u,
        life: 0.5 + Math.random() * 0.6,
      });
    }
  }

  drawCover(g, road, color) {
    g.beginPath();
    g.moveTo(0, road + 2);
    for (let i = 0; i < this.heights.length; i++) g.lineTo(i * COLUMN, road + 2 - this.heights[i]);
    g.lineTo((this.heights.length - 1) * COLUMN, road + 2);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  drawSpray(g, dot) {
    for (const s of this.spray) {
      g.globalAlpha = Math.min(1, s.life * 2);
      g.drawImage(dot, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    g.globalAlpha = 1;
  }
}

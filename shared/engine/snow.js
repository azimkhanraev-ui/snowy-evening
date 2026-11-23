import { TAU, clamp } from './draw.js';

const MAX_FLAKES = 1100;
const MAX_SPRAY = 170;
const COLUMN = 5;
const GRAVITY = 320;
// Road snow in scene units: how deep it may get and how fast it grows at 100 % snow.
const COVER_LIMIT = 30;
const COVER_GROWTH = 0.14;

export class Snowfall {
  flakes = [];

  update(dt, time, { w, h, u }, amount, wind) {
    const wanted = Math.min(MAX_FLAKES, Math.round(((w * h) / 2200) * (amount / 100)));
    if (this.flakes.length > wanted) this.flakes.length = wanted;
    while (this.flakes.length < wanted) {
      this.flakes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        depth: 0.2 + Math.random() ** 2 * 0.8,
        phase: Math.random() * TAU,
      });
    }
    const speed = Math.max(u, 0.6);
    for (const f of this.flakes) {
      f.y += (22 + 80 * f.depth) * speed * dt;
      f.x += (wind * 2.6 * f.depth + Math.sin(time * 1.2 + f.phase) * 14) * speed * dt;
      if (f.y > h + 8) {
        f.y = -8;
        f.x = Math.random() * w;
      }
      if (f.x < -8) f.x += w + 16;
      else if (f.x > w + 8) f.x -= w + 16;
    }
  }

  resize(scaleX, scaleY) {
    for (const f of this.flakes) {
      f.x *= scaleX;
      f.y *= scaleY;
    }
  }

  draw(g, { u }, dot) {
    const scale = Math.max(u, 0.6);
    for (const f of this.flakes) {
      const size = (2.5 + f.depth * 7) * scale;
      g.globalAlpha = 0.3 + f.depth * 0.65;
      g.drawImage(dot, f.x - size / 2, f.y - size / 2, size, size);
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

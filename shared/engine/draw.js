export const TAU = Math.PI * 2;
export const LIGHT_COLORS = ['#ff5d5d', '#ffd166', '#5de2a5', '#62b6ff', '#ff8ad8'];

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Seeded, so the landscape is identical after a resize or a restart.
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function mix(from, to, amount) {
  const target = channels(to);
  const mixed = channels(from).map((v, i) => Math.round(v + (target[i] - v) * amount).toString(16).padStart(2, '0'));
  return `#${mixed.join('')}`;
}

export function alpha(hex, opacity) {
  return `rgba(${channels(hex).join(',')},${opacity})`;
}

export function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** A pre-rendered soft dot: far cheaper per frame than a gradient or shadowBlur. */
export function softDot(color, core = 0) {
  const canvas = surface(64, 64);
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  if (core) gradient.addColorStop(core, color);
  else gradient.addColorStop(0.3, alpha(color, 0.35));
  gradient.addColorStop(1, alpha(color, 0));
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return canvas;
}

export function polygon(g, points, fill) {
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

export function box(g, x, y, width, height, radius, fill) {
  g.beginPath();
  g.roundRect(x, y, width, height, radius);
  g.fillStyle = fill;
  g.fill();
}

export function disc(g, x, y, radius, fill) {
  g.beginPath();
  g.arc(x, y, radius, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

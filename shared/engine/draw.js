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

export const CLUMP_TURNS = 16;

/**
 * Snowflake pictures: crisp and soft dots, out-of-focus discs for flakes close to the
 * viewer, and clumps of crystals stuck together the way big wet flakes look.
 */
export function flakeSprites(color = '#f4f9ff') {
  const bokeh = surface(64, 64);
  const b = bokeh.getContext('2d');
  const gradient = b.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, alpha(color, 0.7));
  gradient.addColorStop(0.55, alpha(color, 0.55));
  gradient.addColorStop(0.8, alpha(color, 0.2));
  gradient.addColorStop(1, alpha(color, 0));
  b.fillStyle = gradient;
  b.fillRect(0, 0, 64, 64);

  // Each clump is drawn ahead in every turn it can take while it tumbles, so a frame only copies pictures.
  const dot = softDot(color, 0.45);
  const clumps = [0, 1, 2].map((seed) => {
    const next = random(seed * 977 + 13);
    const parts = Array.from({ length: 5 + Math.floor(next() * 4) }, () => ({
      angle: next() * TAU, distance: next() * 13, size: 16 + next() * 16, alpha: 0.65 + next() * 0.35,
    }));
    return Array.from({ length: CLUMP_TURNS }, (_, turn) => {
      const canvas = surface(64, 64);
      const g = canvas.getContext('2d');
      for (const part of parts) {
        const angle = part.angle + (turn / CLUMP_TURNS) * TAU;
        g.globalAlpha = part.alpha;
        g.drawImage(dot, 32 + Math.cos(angle) * part.distance - part.size / 2, 32 + Math.sin(angle) * part.distance - part.size / 2, part.size, part.size);
      }
      return canvas;
    });
  });

  return { sharp: softDot(color, 0.55), soft: softDot(color, 0.3), bokeh, clumps };
}

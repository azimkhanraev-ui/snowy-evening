import { alpha, disc, mix, polygon, random } from './draw.js';

export function pine(g, x, y, height, color, cap) {
  const half = height * 0.3;
  for (let i = 0; i < 3; i++) {
    const bottom = y - height * 0.26 * i;
    const top = bottom - height * (0.48 - i * 0.015);
    const spread = half * (1 - i * 0.22);
    polygon(g, [[x, top], [x + spread, bottom], [x, bottom - height * 0.04], [x - spread, bottom]], color);
    if (!cap) continue;
    const drop = (bottom - top) * 0.4;
    polygon(g, [
      [x, top], [x + spread * 0.4, top + drop], [x + spread * 0.12, top + drop * 0.8],
      [x - spread * 0.1, top + drop * 1.1], [x - spread * 0.4, top + drop],
    ], cap);
  }
}

function drawStars(g, { w, u, horizon }, strength) {
  const next = random(17);
  for (let i = 0, n = Math.round((w * horizon) / 2600); i < n; i++) {
    const y = next() ** 1.4 * horizon * 0.85;
    g.globalAlpha = strength * (0.25 + next() * 0.75) * (1 - y / horizon);
    disc(g, next() * w, y, (0.4 + next() * next() * 1.3) * u, '#f4f7ff');
  }
  g.globalAlpha = 1;
}

function drawAurora(g, { w, horizon }) {
  for (const [color, lift, opacity] of [['#54e6b5', 0.46, 0.2], ['#7a8cff', 0.36, 0.14]]) {
    const ribbon = g.createLinearGradient(0, horizon * (lift - 0.25), 0, horizon * (lift + 0.16));
    ribbon.addColorStop(0, alpha(color, 0));
    ribbon.addColorStop(0.7, alpha(color, opacity));
    ribbon.addColorStop(1, alpha(color, 0));
    g.beginPath();
    g.moveTo(0, horizon * lift);
    g.bezierCurveTo(w * 0.3, horizon * (lift - 0.4), w * 0.55, horizon * (lift + 0.1), w, horizon * (lift - 0.3));
    g.lineTo(w, horizon * (lift + 0.05));
    g.bezierCurveTo(w * 0.6, horizon * (lift + 0.3), w * 0.3, horizon * lift, 0, horizon * (lift + 0.2));
    g.closePath();
    g.fillStyle = ribbon;
    g.fill();
  }
}

function drawSunOrMoon(g, { w, u, horizon }, p) {
  const body = p.sun ?? p.moon;
  const x = body.x * w;
  const y = body.y * horizon;
  const r = body.r * u;
  const color = body.color ?? '#eef2ff';
  const halo = g.createRadialGradient(x, y, r * 0.5, x, y, r * 8);
  halo.addColorStop(0, alpha(color, p.sun ? 0.5 : 0.25));
  halo.addColorStop(1, alpha(color, 0));
  g.fillStyle = halo;
  g.fillRect(x - r * 8, y - r * 8, r * 16, r * 16);
  disc(g, x, y, r, color);
  if (!p.moon) return;
  for (const [dx, dy, size] of [[-0.35, -0.2, 0.24], [0.3, 0.3, 0.17], [0.28, -0.4, 0.12]]) {
    disc(g, x + dx * r, y + dy * r, size * r, '#cbd4ec');
  }
}

function drawSky(g, view, p) {
  const sky = g.createLinearGradient(0, 0, 0, view.horizon);
  p.sky.forEach((color, i) => sky.addColorStop(i / (p.sky.length - 1), color));
  g.fillStyle = sky;
  g.fillRect(0, 0, view.w, view.h);
  if (p.stars) drawStars(g, view, p.stars);
  if (p.aurora) drawAurora(g, view);
  drawSunOrMoon(g, view, p);
}

function mountains(g, { w, h, u }, seed, base, rise, color, cap) {
  const next = random(seed);
  for (let x = -90 * u; x < w + 220 * u; x += (110 + next() * 150) * u) {
    const y = base - rise * (0.5 + next() * 0.5);
    const half = (170 + next() * 120) * u;
    polygon(g, [[x - half, base], [x, y], [x + half, base], [x + half, h], [x - half, h]], color);
    const t = 0.32;
    const drop = (base - y) * t;
    const reach = half * t;
    polygon(g, [
      [x, y], [x + reach, y + drop], [x + reach * 0.4, y + drop * 0.75],
      [x, y + drop * 1.15], [x - reach * 0.5, y + drop * 0.8], [x - reach, y + drop],
    ], cap);
  }
}

function forest(g, { w, u }, seed, base, size, color, cap) {
  const next = random(seed);
  for (let x = -20 * u; x < w + 20 * u; x += (12 + next() * 22) * u) {
    pine(g, x, base + next() * 14 * u, size * (0.55 + next() * 0.45) * u, color, cap);
  }
}

function drawSnowfield(g, { w, h, u, ground, road }, p) {
  const snow = g.createLinearGradient(0, ground - 40 * u, 0, h);
  snow.addColorStop(0, p.snow[0]);
  snow.addColorStop(1, p.snow[1]);
  g.beginPath();
  g.moveTo(0, ground - 12 * u);
  g.bezierCurveTo(w * 0.22, ground - 46 * u, w * 0.4, ground + 22 * u, w * 0.6, ground - 6 * u);
  g.bezierCurveTo(w * 0.75, ground - 22 * u, w * 0.9, ground - 4 * u, w, ground - 20 * u);
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.closePath();
  g.fillStyle = snow;
  g.fill();

  g.fillStyle = p.road;
  g.fillRect(0, road - 14 * u, w, 30 * u);
  g.fillStyle = alpha(p.snow[0], 0.45);
  for (let x = 0; x < w; x += 74 * u) g.fillRect(x, road + 7 * u, 32 * u, 2 * u);
}

function drawPhoto(g, { w, h }, p, image) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  g.drawImage(image, (w - width) / 2, (h - height) / 2, width, height);
  g.fillStyle = alpha(p.tint, p.shade);
  g.fillRect(0, 0, w, h);
}

export function drawLandscape(g, view, p, photo) {
  if (photo) return drawPhoto(g, view, p, photo);

  const { u, horizon, ground } = view;
  drawSky(g, view, p);
  mountains(g, view, 4, horizon + 10 * u, 190 * u, p.far, mix(p.far, p.snow[0], 0.5));
  mountains(g, view, 9, horizon + 44 * u, 115 * u, p.mid, mix(p.mid, p.snow[0], 0.33));
  forest(g, view, 23, ground - 34 * u, 70, mix(p.forest, p.mid, 0.5));
  forest(g, view, 31, ground - 8 * u, 88, p.forest, mix(p.forest, p.snow[0], 0.5));
  drawSnowfield(g, view, p);
}

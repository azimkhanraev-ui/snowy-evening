import { TAU, LIGHT_COLORS, alpha, box, disc, mix, polygon } from './draw.js';
import { pine } from './landscape.js';

export const CHIMNEY = [45, -171];
const TREE_X = 137;
const LAMP_X = -178;

function makeBulbs() {
  const bulbs = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const sag = Math.sin(t * Math.PI) * 5 + 8;
    bulbs.push([-91 + 91 * t, -101 - 55 * t + sag]);
    if (i) bulbs.push([91 * t, -156 + 55 * t + sag]);
  }
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    bulbs.push([TREE_X + Math.sin(i * 2.35) * (4 + t * 25), -103 + t * 96]);
  }
  return bulbs.map(([x, y], i) => ({ x, y, color: i % LIGHT_COLORS.length }));
}
const BULBS = makeBulbs();

function paneWindow(g, x, y, c, p) {
  box(g, x - 19, y - 18, 38, 36, 4, c('#f4e6cf'));
  const glass = g.createLinearGradient(0, y - 15, 0, y + 15);
  glass.addColorStop(0, p.glow ? '#fff0ae' : '#bfe1f3');
  glass.addColorStop(1, p.glow ? '#f5a545' : '#7eabc9');
  box(g, x - 15, y - 14, 30, 28, 2, glass);
  g.fillStyle = c('#8d5440');
  g.fillRect(x - 1.5, y - 14, 3, 28);
  g.fillRect(x - 15, y - 1.5, 30, 3);
  box(g, x - 22, y + 16, 44, 6, 3, c('#f7fbff'));
}

function snowman(g, c) {
  const x = -123;
  disc(g, x, -15, 17, c('#dfeaf6'));
  disc(g, x, -38, 12.5, c('#e9f2fb'));
  disc(g, x, -56, 9, c('#f4f9ff'));
  box(g, x - 10, -49, 20, 5, 2.5, c('#d94a54'));
  box(g, x + 4, -47, 5, 15, 2, c('#d94a54'));
  box(g, x - 8, -66, 16, 3, 1, c('#2d3550'));
  box(g, x - 5.5, -76, 11, 11, 1, c('#2d3550'));
  polygon(g, [[x + 1, -57], [x + 12, -54], [x + 1, -53]], c('#f28c38'));
  for (const [dx, y] of [[-3, -59], [4, -59], [0, -40], [0, -33]]) disc(g, x + dx, y, 1.4, c('#2d3550'));
}

function lamp(g, c, p) {
  box(g, LAMP_X - 2.5, -104, 5, 104, 2, c('#2b3552'));
  box(g, LAMP_X - 11, -124, 22, 22, 4, p.glow ? '#ffe3a0' : c('#b9d3e6'));
  polygon(g, [[LAMP_X - 15, -123], [LAMP_X, -135], [LAMP_X + 15, -123]], c('#2b3552'));
  box(g, LAMP_X - 11, -131, 22, 5, 3, c('#f7fbff'));
}

/** Draws the yard around the origin, which is the middle of the doorstep. */
export function drawHouse(g, p) {
  const c = (color) => mix(color, p.tint, p.shade);

  if (p.glow) {
    const pool = g.createRadialGradient(0, -30, 10, 0, -30, 170);
    pool.addColorStop(0, alpha('#ffbd6b', 0.3 * p.glow));
    pool.addColorStop(1, alpha('#ffbd6b', 0));
    g.fillStyle = pool;
    g.fillRect(-170, -200, 340, 340);
  }

  box(g, 33, -164, 24, 50, 2, c('#8a4b46'));
  box(g, 30, -170, 30, 9, 4, c('#f7fbff'));
  polygon(g, [[-78, 0], [-78, -96], [0, -145], [78, -96], [78, 0]], c('#b5654a'));
  g.fillStyle = c('#a25540');
  for (let y = -86; y < 0; y += 15) g.fillRect(-78, y, 156, 3);

  polygon(g, [[-95, -93], [0, -151], [95, -93], [86, -87], [0, -138], [-86, -87]], c('#5b3445'));
  g.beginPath();
  g.moveTo(-100, -94);
  g.quadraticCurveTo(-52, -137, 0, -165);
  g.quadraticCurveTo(52, -137, 100, -94);
  g.quadraticCurveTo(94, -89, 86, -97);
  g.quadraticCurveTo(45, -130, 0, -151);
  g.quadraticCurveTo(-45, -130, -86, -97);
  g.quadraticCurveTo(-94, -89, -100, -94);
  g.fillStyle = c('#f7fbff');
  g.fill();

  disc(g, 0, -116, 12, c('#f4e6cf'));
  disc(g, 0, -116, 8.5, p.glow ? '#ffd98a' : c('#a8cfe6'));
  paneWindow(g, -45, -52, c, p);
  paneWindow(g, 45, -52, c, p);

  box(g, -18, -66, 36, 66, [16, 16, 0, 0], c('#f4e6cf'));
  box(g, -14, -62, 28, 62, [13, 13, 0, 0], c('#5e3a3f'));
  g.beginPath();
  g.arc(0, -42, 7, 0, TAU);
  g.lineWidth = 4;
  g.strokeStyle = c('#3f8a5c');
  g.stroke();
  disc(g, 0, -35, 3, c('#e34b55'));
  disc(g, 8, -27, 2, '#ffd166');
  box(g, -26, -6, 52, 10, 4, c('#eaf2fb'));

  pine(g, TREE_X, 0, 128, c('#27694f'), c('#e6f0fa'));
  disc(g, TREE_X, -128, 5, '#ffd166');
  snowman(g, c);
  lamp(g, c, p);
}

/** The animated lights, drawn every frame on top of the cached house. */
export function drawHouseLights(g, p, time, dots, garlands) {
  g.globalCompositeOperation = 'lighter';
  if (p.glow) {
    g.globalAlpha = 0.6 * p.glow;
    g.drawImage(dots.warm, LAMP_X - 50, -163, 100, 100);
  }
  if (garlands) {
    const size = 14 + 10 * p.glow;
    BULBS.forEach(({ x, y, color }, i) => {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.7 + i * 1.3);
      g.globalAlpha = (0.35 + 0.65 * pulse) * (0.45 + 0.55 * p.glow);
      g.drawImage(dots.lights[color], x - size / 2, y - size / 2, size, size);
    });
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  if (garlands) BULBS.forEach(({ x, y, color }) => disc(g, x, y, 2.3, LIGHT_COLORS[color]));
}

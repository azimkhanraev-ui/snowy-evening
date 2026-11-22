import { TAU, alpha, box, disc, mix, polygon } from './draw.js';

export const BLADE_X = 88;
export const HALF_LENGTH = 100;

function wheel(g, x, spin, c) {
  disc(g, x, -15, 16, c('#202636'));
  disc(g, x, -15, 8, c('#aab6c8'));
  g.strokeStyle = c('#59657a');
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = spin + (i * TAU) / 5;
    g.moveTo(x, -15);
    g.lineTo(x + Math.cos(angle) * 7, -15 + Math.sin(angle) * 7);
  }
  g.stroke();
}

/** Draws the truck facing right, wheels standing on y = 0. */
export function drawPlow(g, p, time, distance, dots) {
  const c = (color) => mix(color, p.tint, p.shade * 0.7);

  if (p.glow) {
    const beam = g.createLinearGradient(64, 0, 260, 0);
    beam.addColorStop(0, alpha('#ffeeb0', 0.38 * p.glow));
    beam.addColorStop(1, alpha('#ffeeb0', 0));
    polygon(g, [[64, -40], [260, -70], [260, 8], [64, -31]], beam);
  }

  g.save();
  g.translate(0, Math.sin(time * 19) * 0.7); // engine rumble
  box(g, -72, -32, 136, 14, 4, c('#39445c'));
  polygon(g, [[-76, -70], [-8, -70], [-14, -28], [-68, -28]], c('#d97724'));
  g.fillStyle = c('#b85f18');
  for (let x = -59; x < -14; x += 15) g.fillRect(x, -67, 4, 36);
  g.beginPath();
  g.moveTo(-76, -69);
  g.quadraticCurveTo(-44, -96, -8, -69);
  g.closePath();
  g.fillStyle = c('#eef5fd');
  g.fill();

  box(g, -6, -88, 48, 62, [9, 15, 3, 3], c('#f5912f'));
  box(g, 30, -54, 40, 28, [4, 10, 4, 4], c('#f5912f'));
  polygon(g, [[4, -80], [30, -80], [38, -57], [4, -57]], c('#9fd3ee'));
  polygon(g, [[8, -78], [16, -78], [9, -60], [8, -60]], 'rgba(255,255,255,.4)');
  disc(g, 20, -65, 6, c('#f2bd94'));
  box(g, 13.5, -76, 13, 7, [6, 6, 1, 1], c('#d94a54'));
  box(g, 15, -60, 12, 4, 2, c('#3f8a5c'));
  box(g, -4, -36, 70, 5, 2, c('#fff1d6'));
  box(g, 61, -43, 8, 10, 3, '#fff3b8');
  box(g, -78, -37, 5, 9, 2, '#ff5563');
  box(g, 9, -97, 16, 10, [6, 6, 1, 1], '#ffb020');

  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.45 + 0.55 * Math.sin(time * 9) ** 2;
  const size = 34 + 26 * p.glow;
  g.drawImage(dots.warm, 17 - size / 2, -93 - size / 2, size, size);
  g.restore();

  wheel(g, -46, distance / 16, c);
  wheel(g, 35, distance / 16, c);

  box(g, 60, -21, 22, 6, 2, c('#39445c'));
  g.beginPath();
  g.moveTo(80, -46);
  g.quadraticCurveTo(70, -14, 100, 1);
  g.lineTo(86, 1);
  g.quadraticCurveTo(64, -14, 74, -46);
  g.closePath();
  g.fillStyle = c('#ffd23f');
  g.fill();
}

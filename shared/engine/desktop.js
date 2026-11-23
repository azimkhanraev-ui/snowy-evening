// Snow on the desktop icons, and snowballs made with the mouse.
// Pure logic plus drawing: no DOM, so the rules can be tested in Node.
import { TAU, clamp } from './draw.js';

const GRAVITY = 1100;
const CAP_RATIO = 0.3; // the tallest cap, relative to the icon
const CAP_FILL_SECONDS = 90; // from bare to full at 100 % snow
const HOLD_TO_GATHER = 0.3; // seconds the button stays still before a snowball starts
const STILL = 6; // pixels the pointer may wander while holding still
const SWIPE_SPEED = 900; // pixels per second that knock snow off
const GATHER_RATE = 2.2; // cap heights per second moved into the ball
const BALL_MAX = 16;
const BALL_MIN = 3;
const MAX_THROW = 2400;
const MAX_CHUNKS = 260;
const TRAIL_SECONDS = 0.12;

export class DesktopSnow {
  caps = [];
  chunks = [];
  ball = null;
  pointer = null;
  press = null;
  trail = [];
  clock = 0;
  seeded = false;

  /** `icons` are the icon pictures: [{ x, y, size }] in canvas pixels. */
  setIcons(icons) {
    const old = this.caps;
    const sameList = old.length === icons.length;
    this.caps = icons.map((icon, i) => {
      const before = sameList ? old[i] : old.find((c) => c.x === icon.x && c.y === icon.y);
      // A fresh start shows some snow at once instead of bare icons.
      const fresh = this.seeded ? 0 : icon.size * CAP_RATIO * (0.35 + 0.25 * Math.random());
      if (!before) return { ...icon, h: fresh, seed: Math.random() };
      if (before.x !== icon.x || before.y !== icon.y) {
        this.shake(before, 0, 0); // the icon was dragged away, its snow falls where it stood
        return { ...icon, h: 0, seed: before.seed };
      }
      return { ...icon, h: Math.min(before.h, icon.size * CAP_RATIO), seed: before.seed };
    });
    if (this.ball?.source?.cap) this.ball.source = null;
    // After the option was off or the icons were hidden, start with some snow again.
    this.seeded = icons.length > 0;
  }

  /** `pointer` is { x, y, primary, middle } in canvas pixels, or null when it is not over the desktop. */
  setPointer(pointer) {
    const previous = this.pointer;
    this.pointer = pointer;
    if (!pointer) {
      this.release(false);
      this.trail.length = 0;
      return;
    }
    this.trail.push({ x: pointer.x, y: pointer.y, t: this.clock });
    while (this.trail.length > 2 && this.clock - this.trail[0].t > TRAIL_SECONDS) this.trail.shift();

    if (previous) this.swipe(previous, pointer);
    const down = pointer.primary || pointer.middle;
    if (down && !this.press) {
      this.press = { x: pointer.x, y: pointer.y, t: this.clock, middle: !pointer.primary, target: this.targetAt(pointer.x, pointer.y), moved: false };
      if (this.press.middle) this.gather();
    } else if (this.press && !down) {
      this.release(true);
    } else if (this.press && Math.hypot(pointer.x - this.press.x, pointer.y - this.press.y) > STILL) {
      this.press.moved = true; // a normal drag, e.g. selecting icons
    }
  }

  velocity() {
    if (this.trail.length < 2) return [0, 0];
    const a = this.trail[0];
    const b = this.trail[this.trail.length - 1];
    const t = Math.max(b.t - a.t, 1 / 60);
    return [(b.x - a.x) / t, (b.y - a.y) / t];
  }

  /** What snow lies under a point: an icon cap, the ground, or nothing. */
  targetAt(x, y) {
    for (const cap of this.caps) {
      if (cap.h < 1) continue;
      if (x >= cap.x - 4 && x <= cap.x + cap.size + 4 && y >= cap.y - cap.h - 8 && y <= cap.y + 4) return { cap };
    }
    if (this.world && y >= this.world.groundAt(x) - 14) return { ground: true, x };
    return null;
  }

  swipe(from, to) {
    const dt = Math.max(this.clock - (this.trail.at(-2)?.t ?? this.clock - 1 / 30), 1 / 120);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.hypot(dx, dy) / dt < SWIPE_SPEED) return;
    for (const cap of this.caps) {
      if (cap.h >= 1 && segmentHitsBox(from, to, cap.x, cap.y - cap.h - 4, cap.x + cap.size, cap.y + 4)) {
        this.shake(cap, (dx / dt) * 0.35, (dy / dt) * 0.25);
      }
    }
  }

  gather() {
    if (this.ball || !this.press?.target) return; // nothing to make it from
    const { x, y } = this.pointer;
    this.ball = { x, y, vx: 0, vy: 0, r: 0, held: true, source: this.press.target, spin: 0 };
  }

  release(throwIt) {
    const press = this.press;
    this.press = null;
    const ball = this.ball;
    if (ball?.held) {
      ball.held = false;
      if (!throwIt || ball.r < BALL_MIN) {
        if (ball.r >= 1) this.burst(ball, 0, 0);
        this.ball = null;
        return;
      }
      let [vx, vy] = this.velocity();
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_THROW) [vx, vy] = [(vx / speed) * MAX_THROW, (vy / speed) * MAX_THROW];
      Object.assign(ball, { vx, vy });
      return;
    }
    // A quick click on the snow brushes it off.
    if (throwIt && press?.target?.cap && !press.moved && this.clock - press.t < HOLD_TO_GATHER) {
      this.shake(press.target.cap, 0, -60);
    }
  }

  /** Knocks all snow off one icon. */
  shake(cap, vx, vy) {
    if (cap.h < 0.5) return;
    const count = clamp(Math.round(cap.h * 0.7), 3, 16);
    for (let i = 0; i < count && this.chunks.length < MAX_CHUNKS; i++) {
      this.chunks.push({
        x: cap.x + Math.random() * cap.size,
        y: cap.y - Math.random() * cap.h,
        vx: vx + (Math.random() - 0.5) * 120,
        vy: vy - Math.random() * 140,
        r: 1.5 + Math.random() * Math.min(4, cap.h / 4),
        from: cap,
      });
    }
    cap.h = 0;
  }

  burst(ball, vx, vy, from = null) {
    const count = clamp(Math.round(ball.r * 1.2), 3, 18);
    for (let i = 0; i < count && this.chunks.length < MAX_CHUNKS; i++) {
      const angle = Math.random() * TAU;
      const speed = 60 + Math.random() * 200;
      this.chunks.push({
        x: ball.x,
        y: ball.y,
        vx: vx * 0.25 + Math.cos(angle) * speed,
        vy: vy * 0.15 + Math.sin(angle) * speed - 120,
        r: 1.2 + Math.random() * ball.r * 0.3,
        from,
      });
    }
  }

  /**
   * `world` connects the icons with the rest of the scene:
   * { amount, w, h, groundAt(x), addToGround(x, size), takeFromGround(x, size) }
   */
  update(dt, world) {
    this.world = world;
    this.clock += dt;
    const growth = (world.amount / 100) * (dt / CAP_FILL_SECONDS);
    for (const cap of this.caps) cap.h = Math.min(cap.size * CAP_RATIO, cap.h + cap.size * CAP_RATIO * growth);

    const press = this.press;
    if (press && !press.moved && !this.ball && press.target && this.clock - press.t >= HOLD_TO_GATHER) this.gather();
    if (this.ball) this.moveBall(dt, world);
    this.moveChunks(dt, world);
  }

  moveBall(dt, world) {
    const ball = this.ball;
    if (ball.held) {
      if (this.pointer) {
        ball.x = this.pointer.x;
        ball.y = this.pointer.y - ball.r * 0.6;
      }
      if (ball.r >= BALL_MAX || !ball.source) return;
      const want = GATHER_RATE * dt * 8;
      let got = 0;
      if (ball.source.cap) {
        const cap = ball.source.cap;
        got = Math.min(cap.h, want * (cap.size / 70));
        cap.h -= got;
        if (cap.h < 0.5) ball.source = null;
      } else {
        got = world.takeFromGround(ball.source.x, want);
        if (got <= 0.01) ball.source = null;
      }
      ball.r = Math.min(BALL_MAX, Math.sqrt(ball.r ** 2 + got * 6));
      return;
    }

    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += (ball.vx / Math.max(ball.r, 1)) * dt;
    for (const cap of this.caps) {
      const top = cap.y - cap.h;
      const nearX = clamp(ball.x, cap.x, cap.x + cap.size);
      const nearY = clamp(ball.y, top, cap.y + cap.size);
      if (Math.hypot(ball.x - nearX, ball.y - nearY) < ball.r) {
        this.shake(cap, ball.vx * 0.3, Math.min(ball.vy, 0) * 0.3 - 80);
        return this.smash(ball, cap);
      }
    }
    const floor = world.groundAt(ball.x);
    if (ball.y + ball.r >= floor) {
      world.addToGround(ball.x, ball.r * 1.4);
      return this.smash(ball);
    }
    if (ball.x < -60 || ball.x > world.w + 60 || ball.y > world.h + 60) this.ball = null;
  }

  smash(ball, cap = null) {
    this.burst(ball, ball.vx, ball.vy, cap);
    this.ball = null;
  }

  moveChunks(dt, world) {
    if (!this.chunks.length) return;
    const keep = [];
    for (const c of this.chunks) {
      const before = c.y;
      c.vy += GRAVITY * 0.8 * dt;
      c.vx *= 1 - Math.min(1, dt * 1.5);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.vy > 0 && this.landOnCap(c, before)) continue;
      if (c.y >= world.groundAt(c.x)) {
        world.addToGround(c.x, c.r * 0.5);
        continue;
      }
      if (c.x > -20 && c.x < world.w + 20 && c.y < world.h + 20) keep.push(c);
    }
    this.chunks = keep;
  }

  landOnCap(chunk, before) {
    for (const cap of this.caps) {
      if (cap === chunk.from || chunk.x < cap.x || chunk.x > cap.x + cap.size) continue;
      const top = cap.y - cap.h;
      if (before <= top && chunk.y >= top) {
        cap.h = Math.min(cap.size * CAP_RATIO, cap.h + chunk.r * 0.35);
        return true;
      }
    }
    return false;
  }

  draw(g, color, shade) {
    for (const cap of this.caps) if (cap.h >= 0.5) drawCap(g, cap, color, shade);
    g.fillStyle = color;
    g.beginPath();
    for (const c of this.chunks) {
      g.moveTo(c.x + c.r, c.y);
      g.arc(c.x, c.y, c.r, 0, TAU);
    }
    g.fill();
    if (this.ball && this.ball.r >= 1) drawBall(g, this.ball, color, shade);
  }
}

/** A soft, lumpy pile whose edges droop over the sides of the icon. */
function drawCap(g, { x, y, size, h, seed }, color, shade) {
  const left = x - size * 0.06;
  const right = x + size * 1.06;
  const base = y + size * 0.1;
  const top = y - h;
  const a = 0.3 + seed * 0.15; // where the two humps sit
  const b = 0.62 + seed * 0.12;
  g.beginPath();
  g.moveTo(left, base);
  g.quadraticCurveTo(left - h * 0.12, y - h * 0.25, x + size * 0.1, y - h * 0.72);
  g.quadraticCurveTo(x + size * (a - 0.12), top - h * 0.08, x + size * a, top + h * 0.06);
  g.quadraticCurveTo(x + size * ((a + b) / 2), top + h * 0.2, x + size * b, top - h * 0.04);
  g.quadraticCurveTo(x + size * (b + 0.14), top + h * 0.05, x + size * 0.92, y - h * 0.68);
  g.quadraticCurveTo(right + h * 0.12, y - h * 0.25, right, base);
  g.closePath();
  const fill = g.createLinearGradient(0, top, 0, base);
  fill.addColorStop(0, color);
  fill.addColorStop(1, shade);
  g.fillStyle = fill;
  g.fill();
}

function drawBall(g, { x, y, r }, color, shade) {
  const fill = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  fill.addColorStop(0, color);
  fill.addColorStop(1, shade);
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

/** Whether a line segment crosses an axis-aligned box. */
export function segmentHitsBox(a, b, left, top, right, bottom) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - left], [dx, right - a.x], [-dy, a.y - top], [dy, bottom - a.y]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

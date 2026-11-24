// Snow that settles on the top edges of open windows, as seen from a layer above them.
// Pure logic plus drawing: no DOM, so the rules can be tested in Node.
import { TAU, clamp } from './draw.js';
import { segmentHitsBox } from './desktop.js';

const COLUMN = 4; // pixels per height sample
const CAP_MAX = 15; // the deepest snow on a window, in canvas pixels
const FILL_SECONDS = 60; // from bare to full at 100 % snow
const EDGE_TAPER = 16; // the snow thins out towards the corners over this many pixels
const LANDED = 0.25; // what one flake adds where it lands
const SWIPE_SPEED = 900;
const SWIPE_REACH = 26; // a swipe clears this far to each side of the mouse path
const GRAVITY = 900;
const MAX_CHUNKS = 400;
// A window needs this much room above it to show any snow.
const MIN_ROOM = 3;

export class WindowSnow {
  windows = []; // topmost first
  chunks = [];
  pointer = null;
  clock = 0;
  pointerAt = 0;
  seeded = false;

  /**
   * `list` holds the open windows from the topmost down: [{ id, x, y, w, h, cap }] in canvas
   * pixels. `cap` is false for windows that block the view but keep no snow (maximized ones).
   * A window that moved or disappeared drops its snow.
   */
  setWindows(list) {
    const old = new Map(this.windows.map((win) => [win.id, win]));
    this.windows = list.map((next) => {
      const before = old.get(next.id);
      old.delete(next.id);
      const columns = Math.max(2, Math.ceil(next.w / COLUMN) + 1);
      const seed = before?.seed ?? Math.random();
      const win = { ...next, seed, columns, limits: limitsFor(next.w, columns, seed), heights: new Float32Array(columns) };
      if (!before) {
        // On a fresh start the windows already carry some snow.
        if (!this.seeded && next.cap) win.heights.forEach((_, i) => (win.heights[i] = win.limits[i] * (0.3 + Math.random() * 0.15)));
        return win;
      }
      const moved = Math.abs(before.x - next.x) > 1 || Math.abs(before.y - next.y) > 1;
      if (moved || !next.cap) {
        this.shake(before, 0, before.columns - 1, 0, 0);
      } else {
        // Same place, maybe a new width: keep what lies on the part that is still there.
        for (let i = 0; i < columns; i++) win.heights[i] = Math.min(before.heights[Math.min(i, before.columns - 1)], win.limits[i]);
        if (columns < before.columns) this.shake(before, columns, before.columns - 1, 0, 0);
      }
      return win;
    });
    for (const gone of old.values()) this.shake(gone, 0, gone.columns - 1, 0, 0);
    this.seeded = list.length > 0;
    this.exposure();
  }

  /** Marks which columns of each window are open to the sky, not under a window above. */
  exposure() {
    for (let i = 0; i < this.windows.length; i++) {
      const win = this.windows[i];
      win.open = new Uint8Array(win.columns);
      if (!win.cap || win.y < MIN_ROOM) continue;
      const probe = win.y - 2;
      for (let c = 0; c < win.columns; c++) {
        const x = Math.min(win.x + c * COLUMN, win.x + win.w - 1);
        let open = true;
        for (let j = 0; j < i && open; j++) {
          const above = this.windows[j];
          if (x >= above.x && x < above.x + above.w && probe >= above.y && probe < above.y + above.h) open = false;
        }
        win.open[c] = open ? 1 : 0;
      }
    }
  }

  /** The mouse anywhere on this screen, { x, y } in canvas pixels, or null. */
  setPointer(pointer) {
    const previous = this.pointer;
    const dt = Math.max(this.clock - this.pointerAt, 1 / 120);
    this.pointer = pointer;
    this.pointerAt = this.clock;
    if (!pointer || !previous) return;
    const dx = pointer.x - previous.x;
    const dy = pointer.y - previous.y;
    if (Math.hypot(dx, dy) / dt < SWIPE_SPEED) return;
    for (const win of this.windows) {
      if (!win.cap || !segmentHitsBox(previous, pointer, win.x, win.y - CAP_MAX - 6, win.x + win.w, win.y + 3)) continue;
      const from = Math.floor((Math.min(previous.x, pointer.x) - SWIPE_REACH - win.x) / COLUMN);
      const to = Math.ceil((Math.max(previous.x, pointer.x) + SWIPE_REACH - win.x) / COLUMN);
      this.shake(win, from, to, (dx / dt) * 0.3, (dy / dt) * 0.2);
    }
  }

  /** Knocks the snow off columns `from`..`to` of a window. */
  shake(win, from, to, vx, vy) {
    from = clamp(from, 0, win.columns - 1);
    to = clamp(to, 0, win.columns - 1);
    for (let c = from; c <= to; c++) {
      const h = win.heights[c];
      if (h < 0.5) continue;
      win.heights[c] = 0;
      if (c % 2 || this.chunks.length >= MAX_CHUNKS) continue; // every other column is plenty
      this.chunks.push({
        x: win.x + c * COLUMN,
        y: win.y - Math.random() * h,
        vx: vx + (Math.random() - 0.5) * 90,
        vy: vy - Math.random() * 110,
        r: 1.2 + Math.random() * Math.min(3.2, h / 3),
        from: win.id,
      });
    }
  }

  /**
   * Catches a falling flake on the first window it meets, if that spot is open to the sky.
   * Returns true when the flake has landed.
   */
  land(x, before, after) {
    for (const win of this.windows) {
      if (!win.cap || x < win.x || x >= win.x + win.w) continue;
      const c = Math.round((x - win.x) / COLUMN);
      if (!win.open?.[c]) continue;
      const surface = win.y - win.heights[c];
      if (before <= surface && after >= surface) {
        for (let i = Math.max(0, c - 1); i <= Math.min(win.columns - 1, c + 1); i++) {
          win.heights[i] = Math.min(win.limits[i], win.heights[i] + LANDED * (i === c ? 1 : 0.5));
        }
        return true;
      }
    }
    return false;
  }

  /** `world` is { amount (0..100), h }. */
  update(dt, world) {
    this.clock += dt;
    const growth = (world.amount / 100) * (dt / FILL_SECONDS);
    for (const win of this.windows) {
      if (!win.cap || !win.open) continue;
      for (let c = 0; c < win.columns; c++) {
        if (win.open[c]) win.heights[c] = Math.min(win.limits[c], win.heights[c] + win.limits[c] * growth);
      }
    }
    this.moveChunks(dt, world);
  }

  moveChunks(dt, world) {
    if (!this.chunks.length) return;
    const keep = [];
    for (const c of this.chunks) {
      const before = c.y;
      c.vy += GRAVITY * dt;
      c.vx *= 1 - Math.min(1, dt * 1.5);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.vy > 0 && this.catchChunk(c, before)) continue;
      if (c.y < world.h + 20) keep.push(c);
    }
    this.chunks = keep;
  }

  catchChunk(chunk, before) {
    for (const win of this.windows) {
      if (win.id === chunk.from || !win.cap || chunk.x < win.x || chunk.x >= win.x + win.w) continue;
      const c = Math.round((chunk.x - win.x) / COLUMN);
      if (!win.open?.[c]) continue;
      const surface = win.y - win.heights[c];
      if (before <= surface && chunk.y >= surface) {
        win.heights[c] = Math.min(win.limits[c], win.heights[c] + chunk.r * 0.6);
        return true;
      }
    }
    return false;
  }

  /**
   * Draws from the bottom window up. Each window first erases the snow of the windows below
   * that it covers, so the canvas must hold nothing else yet.
   */
  draw(g, color, shade) {
    const mode = g.globalCompositeOperation;
    let drawn = false;
    for (let i = this.windows.length - 1; i >= 0; i--) {
      const win = this.windows[i];
      if (drawn) {
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        g.fillRect(win.x, win.y, win.w, win.h);
        g.globalCompositeOperation = mode;
      }
      if (win.cap && win.y >= MIN_ROOM && drawWindowCap(g, win, color, shade)) drawn = true;
    }
    g.globalCompositeOperation = mode;

    if (!this.chunks.length) return;
    g.fillStyle = color;
    g.beginPath();
    for (const c of this.chunks) {
      g.moveTo(c.x + c.r, c.y);
      g.arc(c.x, c.y, c.r, 0, TAU);
    }
    g.fill();
  }
}

/** How deep the snow may get along a window: wavy and lumpy, thinner towards the corners. */
function limitsFor(width, columns, seed) {
  const deepest = Math.min(CAP_MAX, Math.max(5, width * 0.06));
  return Float32Array.from({ length: columns }, (_, c) => {
    const x = Math.min(c * COLUMN, width);
    const edge = Math.min(x, width - x);
    const taper = Math.min(1, (edge + 3) / EDGE_TAPER) ** 0.7;
    const wave = 0.7 + 0.14 * Math.sin(c * 0.09 + seed * 6) + 0.1 * Math.sin(c * 0.31 + seed * 11);
    const lumps = 0.07 * Math.sin(c * 0.83 + seed * 17) + 0.04 * Math.sin(c * 1.9 + seed * 29);
    return deepest * taper * (wave + lumps);
  });
}

/** A soft drift along the top edge whose ends hang a little over the sides. Returns false if bare. */
function drawWindowCap(g, win, color, shade) {
  const { x, y, w, heights, columns } = win;
  let deepest = 0;
  for (let c = 0; c < columns; c++) deepest = Math.max(deepest, heights[c]);
  if (deepest < 0.6) return false;

  const base = y + 1.5;
  const at = (c) => Math.min(x + c * COLUMN, x + w);
  const surface = () => {
    for (let c = 1; c < columns; c++) {
      const mx = (at(c - 1) + at(c)) / 2;
      const my = y - (heights[c - 1] + heights[c]) / 2;
      g.quadraticCurveTo(at(c - 1), y - heights[c - 1], mx, my);
    }
    g.lineTo(x + w, y - heights[columns - 1]);
  };
  const lipLeft = Math.min(heights[0], 4);
  const lipRight = Math.min(heights[columns - 1], 4);

  g.beginPath();
  g.moveTo(x - lipLeft * 0.4, base + lipLeft * 0.5);
  g.quadraticCurveTo(x - lipLeft * 0.5, y - heights[0], at(0), y - heights[0]);
  surface();
  g.quadraticCurveTo(x + w + lipRight * 0.5, y - heights[columns - 1], x + w + lipRight * 0.4, base + lipRight * 0.5);
  // Back along the frame, tucked under the snow only where there is some.
  for (let c = columns - 1; c >= 0; c--) g.lineTo(at(c), y + Math.min(1.5, heights[c]));
  g.closePath();
  const fill = g.createLinearGradient(0, y - deepest, 0, base);
  fill.addColorStop(0, color);
  fill.addColorStop(0.55, color);
  fill.addColorStop(1, shade);
  g.fillStyle = fill;
  g.fill();

  // Light catches the crest of the snow, wherever there is some.
  g.beginPath();
  for (let c = 0, drawing = false; c < columns; c++) {
    if (heights[c] < 1.2) {
      drawing = false;
      continue;
    }
    if (drawing) g.lineTo(at(c), y - heights[c]);
    else g.moveTo(at(c), y - heights[c]);
    drawing = true;
  }
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 1;
  g.stroke();

  // A faint shadow where the snow rests on the frame, so it sits on the window instead of floating.
  const shadow = g.createLinearGradient(0, base, 0, base + 4);
  shadow.addColorStop(0, 'rgba(20,35,60,0.22)');
  shadow.addColorStop(1, 'rgba(20,35,60,0)');
  g.fillStyle = shadow;
  for (let c = 0; c < columns; ) {
    if (heights[c] < 1.5) {
      c++;
      continue;
    }
    const start = c;
    while (c < columns && heights[c] >= 1.5) c++;
    g.fillRect(at(start), base, at(c - 1) - at(start) + COLUMN, 4);
  }
  return true;
}

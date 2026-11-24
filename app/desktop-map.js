// Converts the desktop watcher's physical screen pixels into one scene window's pixels.

const inside = (x, y, m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height;

/** Icons whose picture sits on this scene's monitor. */
export function iconsFor(icons, { monitor, scale }) {
  return icons
    .filter((icon) => inside(icon.x + icon.size / 2, icon.y + icon.size / 2, monitor))
    .map((icon) => ({
      x: (icon.x - monitor.x) / scale,
      y: (icon.y - monitor.y) / scale,
      size: icon.size / scale,
    }));
}

/** The mouse, when it is over this scene window. */
export function pointerFor(pointer, { monitor, area = monitor, scale }) {
  if (!pointer || !inside(pointer.x, pointer.y, area)) return null;
  return {
    x: (pointer.x - area.x) / scale,
    y: (pointer.y - area.y) / scale,
    primary: pointer.primary,
    middle: pointer.middle,
  };
}

/** Windows that reach into this scene window, topmost first, in its pixels. */
export function windowsFor(windows, { monitor, area = monitor, scale }) {
  return windows
    .filter((win) => win.x < area.x + area.width && win.x + win.w > area.x && win.y < area.y + area.height && win.y + win.h > area.y)
    .map((win) => ({
      id: win.id,
      x: (win.x - area.x) / scale,
      y: (win.y - area.y) / scale,
      w: win.w / scale,
      h: win.h / scale,
      cap: win.cap,
    }));
}

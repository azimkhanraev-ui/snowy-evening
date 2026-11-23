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

/** The mouse, when it is over this scene's monitor. */
export function pointerFor(pointer, { monitor, scale }) {
  if (!pointer || !inside(pointer.x, pointer.y, monitor)) return null;
  return {
    x: (pointer.x - monitor.x) / scale,
    y: (pointer.y - monitor.y) / scale,
    primary: pointer.primary,
    middle: pointer.middle,
  };
}

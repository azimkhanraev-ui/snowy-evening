// Pure rules for pausing, kept apart from Electron and Win32 so they can be tested.

const EDGE = 2; // tolerance in pixels

/** True when the window fills the whole monitor, like a game or a full-screen video. */
export function isFullscreen(window, monitor) {
  if (!window) return false;
  // An ordinary maximized window also fills the monitor when the taskbar hides itself.
  if (window.maximized && window.captioned) return false;
  return (
    window.left <= monitor.x + EDGE &&
    window.top <= monitor.y + EDGE &&
    window.right >= monitor.x + monitor.width - EDGE &&
    window.bottom >= monitor.y + monitor.height - EDGE
  );
}

/** True when a maximized window hides the desktop on this monitor. */
export function coversDesktop(window, monitor) {
  if (!window?.maximized) return false;
  const x = (window.left + window.right) / 2;
  const y = (window.top + window.bottom) / 2;
  return x >= monitor.x && x < monitor.x + monitor.width && y >= monitor.y && y < monitor.y + monitor.height;
}

/**
 * Decides what one monitor's scene should do.
 * `monitor` is that monitor's rectangle, `monitors` all of them.
 */
export function sceneActivity({ settings, paused, away, exclusive, window, monitor, monitors }) {
  const overlay = settings.mode === 'overlay';
  const game = settings.pauseInGames && (exclusive || monitors.some((m) => isFullscreen(window, m)));
  const covered = !overlay && settings.pauseWhenCovered && coversDesktop(window, monitor);
  return {
    // A paused overlay would leave frozen snow over the user's work, so it is hidden.
    visible: !(overlay && (paused || game)),
    running: !(paused || away || game || covered),
  };
}

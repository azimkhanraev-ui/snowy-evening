// The only native code in the app: placing a window behind the desktop icons
// and finding out whether a game or a maximized window hides the scene.
import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const shell32 = koffi.load('shell32.dll');
const bind = (signature) => user32.func(signature);

// Window handles only use the lower 32 bits, so plain numbers are safe.
const FindWindow = bind('intptr_t __stdcall FindWindowW(const char16_t *cls, const char16_t *title)');
const FindWindowEx = bind('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, const char16_t *cls, const char16_t *title)');
const SendMessageTimeout = bind('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t wparam, intptr_t lparam, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)');
const GetWindowLong = bind('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)');
const SetWindowLong = bind('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)');
const SetLayered = bind('int __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint32_t key, uint8_t alpha, uint32_t flags)');
const SetParent = bind('intptr_t __stdcall SetParent(intptr_t hwnd, intptr_t parent)');
const GetAncestor = bind('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t flags)');
const SetWindowPos = bind('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int w, int h, uint32_t flags)');
const MapWindowPoints = bind('int __stdcall MapWindowPoints(intptr_t from, intptr_t to, _Inout_ int32_t *points, uint32_t count)');
const RedrawWindow = bind('int __stdcall RedrawWindow(intptr_t hwnd, void *rect, void *region, uint32_t flags)');
const IsWindow = bind('int __stdcall IsWindow(intptr_t hwnd)');
const IsZoomed = bind('int __stdcall IsZoomed(intptr_t hwnd)');
const GetForegroundWindow = bind('intptr_t __stdcall GetForegroundWindow()');
const GetWindowRect = bind('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ int32_t *rect)');
const GetClassName = bind('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint16_t *name, int max)');
const GetWindowThreadProcessId = bind('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)');
const QueryNotificationState = shell32.func('int32_t __stdcall SHQueryUserNotificationState(_Out_ int32_t *state)');

const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const GA_PARENT = 1;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_CAPTION = 0x00c00000;
const WS_EX_LAYERED = 0x00080000;
const WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
const LWA_ALPHA = 2;
const SWP_NOSIZE = 0x1;
const SWP_NOMOVE = 0x2;
const SWP_NOACTIVATE = 0x10;
const SWP_SHOWWINDOW = 0x40;
const RDW_REPAINT = 0x1 | 0x4 | 0x80 | 0x100; // invalidate, erase, all children, update now
const SPAWN_WALLPAPER_LAYER = 0x052c; // undocumented Explorer message used by live wallpaper apps
const QUNS_RUNNING_D3D_FULL_SCREEN = 3;

// Shell surfaces that can cover a whole monitor without being an app or a game.
const SHELL_CLASSES = new Set([
  'Progman', 'WorkerW', 'Shell_TrayWnd', 'XamlExplorerHostIslandWindow',
  'MultitaskingViewFrame', 'ForegroundStaging', 'Windows.UI.Core.CoreWindow',
]);

export function handleOf(browserWindow) {
  return Number(browserWindow.getNativeWindowHandle().readBigUInt64LE());
}

function findDesktopLayer() {
  const progman = FindWindow('Progman', null);
  if (!progman) return null;
  SendMessageTimeout(progman, SPAWN_WALLPAPER_LAYER, 0xd, 0, 0, 1000, [0]);
  SendMessageTimeout(progman, SPAWN_WALLPAPER_LAYER, 0xd, 1, 0, 1000, [0]);

  // Windows 11 24H2+ keeps the icons and the wallpaper inside Progman.
  const icons = FindWindowEx(progman, 0, 'SHELLDLL_DefView', null);
  const raised = Boolean(GetWindowLong(progman, GWL_EXSTYLE) & WS_EX_NOREDIRECTIONBITMAP);
  if (icons && raised) {
    return { parent: progman, icons, wallpaper: FindWindowEx(progman, 0, 'WorkerW', null) };
  }

  // Windows 10 and older Windows 11: the WorkerW right after the one that holds the icons.
  let worker = 0;
  while ((worker = FindWindowEx(0, worker, 'WorkerW', null))) {
    if (!FindWindowEx(worker, 0, 'SHELLDLL_DefView', null)) continue;
    const behind = FindWindowEx(0, worker, 'WorkerW', null);
    if (behind) return { parent: behind };
  }

  const nested = FindWindowEx(progman, 0, 'WorkerW', null);
  return nested ? { parent: nested } : null;
}

/** Moves a window behind the desktop icons. `rect` is in physical screen pixels. */
export function attachToDesktop(hwnd, rect) {
  const layer = findDesktopLayer();
  if (!layer) return null;
  const { parent, icons, wallpaper } = layer;

  // `>>> 0` keeps the bitwise result unsigned.
  const style = ((GetWindowLong(hwnd, GWL_STYLE) | WS_CHILD) & ~WS_POPUP) >>> 0;
  SetWindowLong(hwnd, GWL_STYLE, style);
  if (icons) {
    SetWindowLong(hwnd, GWL_EXSTYLE, (GetWindowLong(hwnd, GWL_EXSTYLE) | WS_EX_LAYERED) >>> 0);
    SetLayered(hwnd, 0, 255, LWA_ALPHA);
  }
  SetParent(hwnd, parent);
  if (GetAncestor(hwnd, GA_PARENT) !== parent) return null;

  // A child window is positioned relative to its parent, which spans all monitors.
  const point = [rect.x, rect.y];
  MapWindowPoints(0, parent, point, 1);
  SetWindowPos(hwnd, icons ?? 0, point[0], point[1], rect.width, rect.height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
  if (wallpaper) SetWindowPos(wallpaper, 1, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
  return parent;
}

export function isWindow(hwnd) {
  return Boolean(IsWindow(hwnd));
}

/** Paints the user's own wallpaper back after our window has gone. */
export function repaintDesktop(parent) {
  if (IsWindow(parent)) RedrawWindow(parent, null, null, RDW_REPAINT);
}

export function exclusiveFullscreen() {
  const state = [0];
  return QueryNotificationState(state) === 0 && state[0] === QUNS_RUNNING_D3D_FULL_SCREEN;
}

/** The active window, or null when it is the shell or one of our own windows. */
export function foregroundWindow() {
  const hwnd = GetForegroundWindow();
  if (!hwnd) return null;

  const pid = [0];
  GetWindowThreadProcessId(hwnd, pid);
  if (pid[0] === process.pid) return null;

  const name = new Uint16Array(128);
  const length = GetClassName(hwnd, name, name.length);
  if (SHELL_CLASSES.has(String.fromCharCode(...name.subarray(0, length)))) return null;

  const rect = [0, 0, 0, 0];
  if (!GetWindowRect(hwnd, rect)) return null;
  return {
    left: rect[0],
    top: rect[1],
    right: rect[2],
    bottom: rect[3],
    maximized: Boolean(IsZoomed(hwnd)),
    captioned: (GetWindowLong(hwnd, GWL_STYLE) & WS_CAPTION) === WS_CAPTION,
  };
}

// Worker thread: reads where the desktop icons and the open windows are, and what the mouse does.
// Read-only: it never moves icons or intercepts clicks. It runs apart from the main thread
// because a call into a hung Explorer would otherwise freeze the tray icon too.
import { parentPort } from 'node:worker_threads';
import koffi from 'koffi';

const ole32 = koffi.load('ole32.dll');
const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const POINT = koffi.struct('POINT', { x: 'int32_t', y: 'int32_t' });
const CoInitializeEx = ole32.func('long __stdcall CoInitializeEx(void *reserved, uint32_t flags)');
const CoCreateInstance = ole32.func('long __stdcall CoCreateInstance(const void *clsid, void *outer, uint32_t context, const void *iid, _Out_ void **out)');
const CoTaskMemFree = ole32.func('void __stdcall CoTaskMemFree(void *memory)');
const FindWindowEx = user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, const char16_t *cls, const char16_t *title)');
const IsWindow = user32.func('int __stdcall IsWindow(intptr_t hwnd)');
const IsWindowVisible = user32.func('int __stdcall IsWindowVisible(intptr_t hwnd)');
const MapWindowPoints = user32.func('int __stdcall MapWindowPoints(intptr_t from, intptr_t to, _Inout_ int32_t *points, uint32_t count)');
const GetDpiForWindow = user32.func('uint32_t __stdcall GetDpiForWindow(intptr_t hwnd)');
const GetCursorPos = user32.func('int __stdcall GetCursorPos(_Out_ POINT *point)');
const WindowFromPoint = user32.func('intptr_t __stdcall WindowFromPoint(POINT point)');
const GetAsyncKeyState = user32.func('int16_t __stdcall GetAsyncKeyState(int key)');
const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int index)');
const GetTopWindow = user32.func('intptr_t __stdcall GetTopWindow(intptr_t hwnd)');
const GetWindow = user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)');
const IsIconic = user32.func('int __stdcall IsIconic(intptr_t hwnd)');
const IsZoomed = user32.func('int __stdcall IsZoomed(intptr_t hwnd)');
const GetWindowLong = user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)');
const GetWindowRect = user32.func('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ int32_t *rect)');
const GetClassName = user32.func('int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint16_t *name, int max)');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)');
const DwmGetWindowAttribute = dwmapi.func('long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attribute, void *value, uint32_t size)');

// Explorer refuses these calls from a multithreaded apartment (RPC_E_CANTCALLOUT_ININPUTSYNCCALL).
const COINIT_APARTMENTTHREADED = 2;
const CLSCTX_LOCAL_SERVER = 4;
const SVGIO_ALLVIEW = 2;
const SWC_DESKTOP = 8;
const SWFO_NEEDDISPATCH = 1;
const VT_I4 = 3;
const SM_SWAPBUTTON = 23;
const VK = { LBUTTON: 1, RBUTTON: 2, MBUTTON: 4 };
// The icon picture starts a little below the position Explorer reports.
const ICON_TOP_PADDING = 4;

const GW_HWNDNEXT = 2;
const GWL_EXSTYLE = -20;
const WS_EX_TRANSPARENT = 0x20;
const WS_EX_TOOLWINDOW = 0x80;
const WS_EX_APPWINDOW = 0x40000;
const WS_EX_NOACTIVATE = 0x8000000;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;
const MIN_WIDTH = 100;
const MIN_HEIGHT = 50;
const MAX_WINDOWS = 60;
// Shell surfaces, menus and tooltips are not windows snow could rest on.
const SKIPPED_CLASSES = new Set([
  'Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'NotifyIconOverflowWindow',
  '#32768', 'tooltips_class32', 'Windows.UI.Core.CoreWindow', 'XamlExplorerHostIslandWindow',
  'TopLevelWindowForOverflowXamlIsland', 'ForegroundStaging', 'MultitaskingViewFrame',
]);

const ICONS_EVERY = 700;
const WINDOWS_EVERY = 100;
const POINTER_EVERY = 33;
const IDLE_EVERY = 500;

function guid(text) {
  const hex = text.replace(/-/g, '');
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(parseInt(hex.slice(0, 8), 16), 0);
  bytes.writeUInt16LE(parseInt(hex.slice(8, 12), 16), 4);
  bytes.writeUInt16LE(parseInt(hex.slice(12, 16), 16), 6);
  for (let i = 0; i < 8; i++) bytes[8 + i] = parseInt(hex.slice(16 + i * 2, 18 + i * 2), 16);
  return bytes;
}

const CLSID_ShellWindows = guid('9BA05972-F6A8-11CF-A442-00A0C90A8F39');
const IID_IShellWindows = guid('85CB6900-4D95-11CF-960C-0080C7F4EE85');
const IID_IServiceProvider = guid('6D5140C1-7436-11CE-8034-00AA006009FA');
const SID_STopLevelBrowser = guid('4C96BE40-915C-11CF-99D3-00AA004AE837');
const IID_IShellBrowser = guid('000214E2-0000-0000-C000-000000000046');
const IID_IFolderView2 = guid('1AF3A467-214F-4298-908E-06B03E0B39F9');

// COM methods are called through the object's table of function pointers.
const prototypes = new Map();
function method(object, index, parameters = '') {
  if (!prototypes.has(parameters)) {
    const list = parameters ? `void *self, ${parameters}` : 'void *self';
    prototypes.set(parameters, koffi.proto(`long __stdcall com${prototypes.size}(${list})`));
  }
  const table = koffi.decode(object, 'void *');
  const pointer = koffi.decode(table, index * 8, 'void *');
  return (...args) => {
    const result = koffi.call(pointer, prototypes.get(parameters), object, ...args);
    if (result < 0) throw new Error(`COM 0x${(result >>> 0).toString(16)}`);
    return result;
  };
}
const release = (object) => object && method(object, 2)();
const queryInterface = (object, iid) => {
  const out = [null];
  method(object, 0, 'const void *iid, _Out_ void **out')(iid, out);
  return out[0];
};

/** IFolderView2 of the desktop, plus the list view window that shows the icons. */
function openDesktopView() {
  const held = [];
  try {
    const out = [null];
    const created = CoCreateInstance(CLSID_ShellWindows, null, CLSCTX_LOCAL_SERVER, IID_IShellWindows, out);
    if (created < 0) return null;
    held.push(out[0]);

    const location = Buffer.alloc(24); // VARIANT VT_I4 = CSIDL_DESKTOP (0)
    location.writeUInt16LE(VT_I4, 0);
    const dispatch = [null];
    method(out[0], 15, 'void *location, void *root, int kind, _Out_ int32_t *hwnd, int options, _Out_ void **dispatch')(
      location, Buffer.alloc(24), SWC_DESKTOP, [0], SWFO_NEEDDISPATCH, dispatch,
    );
    held.push(dispatch[0]);
    const provider = queryInterface(dispatch[0], IID_IServiceProvider);
    held.push(provider);
    const browser = [null];
    method(provider, 3, 'const void *sid, const void *iid, _Out_ void **out')(SID_STopLevelBrowser, IID_IShellBrowser, browser);
    held.push(browser[0]);
    const shellView = [null];
    method(browser[0], 15, '_Out_ void **view')(shellView); // QueryActiveShellView
    held.push(shellView[0]);
    const viewWindow = [0];
    method(shellView[0], 3, '_Out_ intptr_t *hwnd')(viewWindow); // IOleWindow::GetWindow
    const folderView = queryInterface(shellView[0], IID_IFolderView2);
    const list = FindWindowEx(viewWindow[0], 0, 'SysListView32', null);
    if (!list) {
      release(folderView);
      return null;
    }
    return { folderView, list };
  } catch {
    return null;
  } finally {
    for (const object of held.reverse()) {
      try {
        release(object);
      } catch {}
    }
  }
}

let desktop = null;
let wants = { icons: false, windows: false };
let lastIcons = '';
let lastWindows = '';
let lastWindowsAt = 0;
let lastPointer = '';
let lastIconsAt = 0;

function readIcons() {
  if (desktop && !IsWindow(desktop.list)) closeDesktop();
  desktop ??= openDesktopView();
  if (!desktop) return [];
  const { folderView, list } = desktop;
  if (!IsWindowVisible(list)) return []; // "Show desktop icons" is off

  try {
    const count = [0];
    method(folderView, 7, 'uint32_t flags, _Out_ int32_t *count')(SVGIO_ALLVIEW, count);
    const mode = [0];
    const size = [0];
    method(folderView, 36, '_Out_ int32_t *mode, _Out_ int32_t *size')(mode, size); // GetViewModeAndIconSize
    const scale = (GetDpiForWindow(list) || 96) / 96;
    const side = Math.round(size[0] * scale);
    const origin = [0, 0];
    MapWindowPoints(list, 0, origin, 1);

    const icons = [];
    const item = method(folderView, 6, 'int index, _Out_ void **pidl');
    const position = method(folderView, 11, 'void *pidl, _Out_ int32_t *point');
    for (let i = 0; i < Math.min(count[0], 500); i++) {
      const pidl = [null];
      item(i, pidl);
      const point = [0, 0];
      try {
        position(pidl[0], point);
      } finally {
        CoTaskMemFree(pidl[0]);
      }
      icons.push({ x: origin[0] + point[0], y: origin[1] + point[1] + Math.round(ICON_TOP_PADDING * scale), size: side });
    }
    return icons;
  } catch {
    closeDesktop(); // Explorer restarted, open it again next time
    return [];
  }
}

function closeDesktop() {
  try {
    release(desktop?.folderView);
  } catch {}
  desktop = null;
}

const className = (hwnd) => {
  const name = new Uint16Array(64);
  const length = GetClassName(hwnd, name, 64);
  return String.fromCharCode(...name.subarray(0, Math.max(0, length)));
};

/** Visible windows from the topmost down: [{ id, x, y, w, h, cap }] in physical pixels. */
function readWindows() {
  const windows = [];
  const cloaked = Buffer.alloc(4);
  const bounds = Buffer.alloc(16);
  let hwnd = GetTopWindow(0);
  for (let n = 0; hwnd && n < 3000 && windows.length < MAX_WINDOWS; n++, hwnd = GetWindow(hwnd, GW_HWNDNEXT)) {
    if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) continue;
    const style = Number(GetWindowLong(hwnd, GWL_EXSTYLE)) >>> 0;
    if (style & (WS_EX_TRANSPARENT | WS_EX_NOACTIVATE)) continue; // click-through overlays, like our own
    if (style & WS_EX_TOOLWINDOW && !(style & WS_EX_APPWINDOW)) continue;
    // Windows on another virtual desktop or suspended apps are "cloaked": present but not shown.
    if (DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked.readUInt32LE(0)) continue;
    const pid = [0];
    GetWindowThreadProcessId(hwnd, pid);
    if (pid[0] === process.pid) continue;
    if (SKIPPED_CLASSES.has(className(hwnd))) continue;

    let left, top, right, bottom;
    // The visible frame, without the invisible resize borders around it.
    if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, bounds, 16) === 0) {
      [left, top, right, bottom] = [0, 4, 8, 12].map((at) => bounds.readInt32LE(at));
    } else {
      const rect = [0, 0, 0, 0];
      if (!GetWindowRect(hwnd, rect)) continue;
      [left, top, right, bottom] = rect;
    }
    if (right - left < MIN_WIDTH || bottom - top < MIN_HEIGHT) continue;
    windows.push({ id: hwnd, x: left, y: top, w: right - left, h: bottom - top, cap: !IsZoomed(hwnd) });
  }
  return windows;
}

function readPointer() {
  const point = {};
  if (!GetCursorPos(point)) return null;
  // Over the bare desktop, not a window or the taskbar.
  const onDesktop = Boolean(wants.icons && desktop && WindowFromPoint(point) === desktop.list);
  if (!onDesktop && !wants.windows) return null;
  const swapped = GetSystemMetrics(SM_SWAPBUTTON) !== 0;
  // GetAsyncKeyState reports physical buttons.
  const down = (key) => (GetAsyncKeyState(key) & 0x8000) !== 0;
  return {
    x: point.x,
    y: point.y,
    primary: down(swapped ? VK.RBUTTON : VK.LBUTTON),
    middle: down(VK.MBUTTON),
    desktop: onDesktop,
  };
}

function send(type, value, last) {
  const text = JSON.stringify(value);
  if (text === last) return last;
  parentPort.postMessage({ type, value });
  return text;
}

function tick() {
  if (!wants.icons && !wants.windows) {
    setTimeout(tick, IDLE_EVERY);
    return;
  }
  const now = Date.now();
  if (wants.icons && now - lastIconsAt >= ICONS_EVERY) {
    lastIconsAt = now;
    lastIcons = send('icons', readIcons(), lastIcons);
  }
  if (wants.windows && now - lastWindowsAt >= WINDOWS_EVERY) {
    lastWindowsAt = now;
    lastWindows = send('windows', readWindows(), lastWindows);
  }
  lastPointer = send('pointer', readPointer(), lastPointer);
  setTimeout(tick, POINTER_EVERY);
}

parentPort.on('message', (message) => {
  if (message.type !== 'watch') return;
  const before = wants;
  wants = { icons: Boolean(message.value.icons), windows: Boolean(message.value.windows) };
  // Whatever starts again sends fresh data at once.
  if (!wants.icons || !before.icons) [lastIcons, lastIconsAt] = ['', 0];
  if (!wants.windows || !before.windows) [lastWindows, lastWindowsAt] = ['', 0];
  lastPointer = '';
});

CoInitializeEx(null, COINIT_APARTMENTTHREADED);
tick();

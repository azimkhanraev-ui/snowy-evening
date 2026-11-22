// The privacy policy promises that the app never goes online. This module enforces it.
import { app, net, protocol, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ORIGIN = 'snow://app';
const PUBLIC_FOLDERS = ['app/scene/', 'app/settings/', 'app/assets/', 'shared/'];
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'";

/** Must run before the app is ready. */
export function prepareOffline() {
  protocol.registerSchemesAsPrivileged([{ scheme: 'snow', privileges: { standard: true, secure: true } }]);
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('no-proxy-server'); // no proxy auto-discovery lookups

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => event.preventDefault());
  });
}

/** Serves bundled files and the chosen background, and cancels every other request. */
export function serveLocalFiles(root, backgroundFile) {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, done) => done(false));
  session.defaultSession.webRequest.onBeforeRequest((details, done) => {
    done({ cancel: !/^(snow|file|devtools):/.test(details.url) });
  });

  protocol.handle('snow', async (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).slice(1);
    let file = null;

    if (relative === 'background') {
      file = backgroundFile();
    } else {
      const resolved = path.resolve(root, relative);
      const inside = path.relative(root, resolved).split(path.sep).join('/');
      if (PUBLIC_FOLDERS.some((folder) => inside.startsWith(folder))) file = resolved;
    }
    if (!file || url.host !== 'app') return new Response(null, { status: 404 });

    try {
      const response = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', CSP);
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

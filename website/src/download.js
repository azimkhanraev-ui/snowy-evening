import { currentLanguage, onLanguage, t } from './i18n.js';

const byId = (id) => document.getElementById(id);

function isWindows() {
  const platform = navigator.userAgentData?.platform;
  return platform ? platform === 'Windows' : /Windows NT/.test(navigator.userAgent);
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));
}

async function loadRelease() {
  try {
    const response = await fetch('./version.json', { cache: 'no-cache' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function initCopyLink() {
  byId('copy-link').addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    const status = byId('copy-status');
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = t('copy.done');
    } catch {
      status.textContent = `${t('copy.failed')} ${url}`;
    }
  });
}

/** Fills in the download block and returns the release data for the changelog. */
export async function initDownload() {
  const windows = isWindows();
  byId('download-actions').hidden = !windows;
  byId('other-os').hidden = windows;
  initCopyLink();

  const release = await loadRelease();
  const published = release?.published === true;
  const links = { installer: byId('download-installer'), portable: byId('download-portable') };

  for (const [kind, link] of Object.entries(links)) {
    const url = release?.files?.[kind]?.url;
    if (release && !published) {
      // Never send visitors to a 404 before the first release exists.
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
    } else if (url?.startsWith('https://')) {
      link.href = url;
    }
  }

  onLanguage(() => {
    const note = byId('release-note');
    note.hidden = published;
    note.textContent = published ? '' : t(release ? 'release.pending' : 'release.unavailable');

    byId('release-version').textContent = release?.version ?? '—';
    if (!published) return;

    const { installer, portable } = release.files;
    const size = (bytes) => (bytes / 1024 / 1024).toLocaleString(currentLanguage(), { maximumFractionDigits: 1 });
    byId('release-size').textContent = `${size(installer.size)} ${t('release.mb')}`;
    links.portable.title = `${size(portable.size)} ${t('release.mb')}`;
    byId('release-date').textContent = formatDate(release.date);
    byId('hash-short').textContent = `${installer.sha256.slice(0, 16)}…`;
    byId('hash-installer').textContent = installer.sha256;
    byId('hash-portable').textContent = portable.sha256;
  });

  return release;
}

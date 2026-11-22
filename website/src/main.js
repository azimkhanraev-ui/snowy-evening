import { initAmbient } from './ambient.js';
import { initDemo, initPreviews } from './demo.js';
import { formatDate, initDownload } from './download.js';
import { currentLanguage, initLanguage, onLanguage, t } from './i18n.js';
import changelog from './changelog.json';

function initChangelog(release) {
  const list = document.getElementById('changelog-list');
  onLanguage(() => {
    const articles = changelog.map((entry) => {
      const article = document.createElement('article');
      const heading = document.createElement('h3');
      const date = document.createElement('p');
      const changes = document.createElement('ul');

      heading.textContent = entry.version;
      // The date of the newest version is known only when it has been released.
      const current = release?.published && release.version === entry.version;
      const iso = entry.date ?? (current ? release.date : null);
      date.className = 'fine';
      date.textContent = iso ? formatDate(iso) : t('changelog.unreleased');

      for (const change of entry.changes[currentLanguage()]) {
        const item = document.createElement('li');
        item.textContent = change;
        changes.append(item);
      }
      article.append(heading, date, changes);
      return article;
    });
    list.replaceChildren(...articles);
  });
}

initLanguage();
initDemo();
initPreviews();
initAmbient();
initChangelog(await initDownload());

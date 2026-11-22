// Russian lives in the HTML, so the page reads fine without JavaScript. English is applied on top.
import en from './en.js';

// Phrases that exist only in scripts.
const ruDynamic = {
  'demo.play': 'Запустить анимацию',
  'demo.pause': 'Остановить анимацию',
  'release.pending': 'Первый релиз готовится. Кнопки заработают, когда он будет опубликован.',
  'release.unavailable': 'Не удалось загрузить сведения о версии. Ссылки ведут на последний релиз.',
  'release.mb': 'МБ',
  'copy.done': 'Ссылка скопирована',
  'copy.failed': 'Скопируйте адрес вручную:',
  'changelog.unreleased': 'готовится к выпуску',
};

const STORAGE_KEY = 'language';
const textNodes = [];
const attributes = [];
const russian = { ...ruDynamic };
const listeners = new Set();

for (const element of document.querySelectorAll('[data-i18n]')) {
  const key = element.dataset.i18n;
  russian[key] ??= element.textContent;
  textNodes.push([element, key]);
}
for (const element of document.querySelectorAll('[data-i18n-attr]')) {
  const [name, key] = element.dataset.i18nAttr.split(':');
  russian[key] ??= element.getAttribute(name);
  attributes.push([element, name, key]);
}

let language = detect();

function stored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage can be blocked
  }
}

function detect() {
  const chosen = new URLSearchParams(location.search).get('lang') ?? stored();
  if (chosen === 'ru' || chosen === 'en') return chosen;
  return /^(ru|be|kk)\b/i.test(navigator.languages?.[0] ?? navigator.language) ? 'ru' : 'en';
}

export function t(key) {
  return (language === 'en' ? en[key] : russian[key]) ?? russian[key] ?? key;
}

export function currentLanguage() {
  return language;
}

/** Runs now and again after every language change. */
export function onLanguage(callback) {
  listeners.add(callback);
  callback();
}

function apply() {
  document.documentElement.lang = language;
  for (const [element, key] of textNodes) element.textContent = t(key);
  for (const [element, name, key] of attributes) element.setAttribute(name, t(key));
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === language));
  }
  for (const callback of listeners) callback();
}

export function initLanguage() {
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.addEventListener('click', () => {
      language = button.dataset.lang;
      try {
        localStorage.setItem(STORAGE_KEY, language);
      } catch {
        // The choice then lasts until the page is closed.
      }
      apply();
    });
  }
  apply();
}

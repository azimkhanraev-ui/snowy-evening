import { PERIOD_IDS } from '../../shared/engine/periods.js';

const api = window.winter.settings;
const NUMERIC = new Set(['snow', 'wind', 'fps']);

for (const id of ['auto', ...PERIOD_IDS]) {
  const label = document.createElement('label');
  label.className = 'pill';
  const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'period', value: id });
  const caption = document.createElement('span');
  caption.dataset.t = id;
  label.append(input, caption);
  document.getElementById('periods').append(label);
}

const autostart = document.getElementById('autostart');
const reset = document.getElementById('reset');

function show({ settings, strings, autostart: startsWithWindows, version }) {
  document.documentElement.lang = strings.locale;
  for (const element of document.querySelectorAll('[data-t]')) element.textContent = strings[element.dataset.t];

  for (const input of document.querySelectorAll('[name]:is(input, select)')) {
    const value = settings[input.name];
    if (input.type === 'checkbox') input.checked = value;
    else if (input.type === 'radio') input.checked = input.value === value;
    else if (input !== document.activeElement || input.type !== 'range') input.value = value;
  }

  document.getElementById('snow-value').textContent = `${settings.snow}%`;
  document.getElementById('wind-value').textContent = settings.wind;
  document.getElementById('version').textContent = `v${version}`;
  autostart.checked = startsWithWindows;
  reset.disabled = !settings.background;
}

document.addEventListener('input', ({ target }) => {
  if (!target.name) return;
  let { value } = target;
  if (target.type === 'checkbox') value = target.checked;
  else if (NUMERIC.has(target.name)) value = Number(value);
  api.update({ [target.name]: value });
});

autostart.addEventListener('change', () => api.setAutostart(autostart.checked));
document.getElementById('choose').addEventListener('click', () => api.chooseBackground());
reset.addEventListener('click', () => api.resetBackground());

api.onChange(show);
show(await api.get());

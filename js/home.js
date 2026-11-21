import { getRoom, link, store, $ } from './common.js';
import { isLocalMode } from './transport.js';
import { unlockAudio, play } from './fx.js';

const r = getRoom();
if (r) location.replace(link('play.html', { r }));

const last = store.get('lieu-last-host-room');
if (last && store.get('lieu-host:' + last)) {
  const a = $('#resume');
  a.hidden = false;
  a.href = link('host.html', { r: last });
  a.querySelector('b').textContent = last;
}
$('#create').href = link('host.html');
$('#tv').href = link('tv.html');
if (isLocalMode()) $('#localNote').hidden = false;

const form = $('#joinForm');
form.code.addEventListener('input', () => {
  form.code.value = form.code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const c = form.code.value;
  if (c.length !== 4) return form.code.focus();
  location.href = link('play.html', { r: c });
});
$('.logo').addEventListener('click', () => {
  unlockAudio();
  play('sneak');
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

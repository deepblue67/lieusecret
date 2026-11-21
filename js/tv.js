// Écran du salon : affichage seul. Il ne reçoit que l'état public : jamais le lieu
// ni les espions avant la révélation.
import { createTransport } from './transport.js';
import * as G from './game.js';
import { getRoom, link, absUrl, esc, $, keepAwake, setConn, qrSvg } from './common.js';
import * as UI from './ui.js';
import * as FX from './fx.js';

const room = getRoom();
if (!room) {
  $('#askCode').hidden = false;
  $('#start').remove();
  const f = $('#askForm');
  f.code.addEventListener('input', () => (f.code.value = f.code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (f.code.value.length === 4) location.href = link('tv.html', { r: f.code.value });
  });
  await new Promise(() => {});
}

const key = 'tv-' + G.randomId(6);
const joinUrl = absUrl('play.html', { r: room });
let state = null;
let skew = 0;
let online = new Set();
const hostNow = () => Date.now() + skew;

$('#qrMini').innerHTML = qrSvg(joinUrl);
$('#codeMini').textContent = room;

const tr = createTransport(room, {
  key,
  meta: { role: 'tv' },
  onStatus: (s) => {
    setConn(s, tr.local);
    if (s === 'online') {
      tr.send('hello', { role: 'tv', id: key });
      tr.send('need-state', {});
    }
  },
});

tr.on('state', ({ state: s, th }) => {
  if (Number.isFinite(th)) skew = th - Date.now();
  if (state && s.gid === state.gid && s.v <= state.v) return;
  const prev = state;
  state = s;
  react(prev);
  render();
});
tr.on('fx', ({ kind, party }) => {
  if (kind === 'join') FX.play('join');
  if (kind === 'podium' && party) {
    FX.play('fanfare');
    FX.confetti({ count: 260 });
  }
});
tr.onPresence((list) => {
  online = new Set(list.filter((m) => m.role === 'player').map((m) => m.id));
  render();
});
setInterval(() => !state && tr.send('need-state', {}), 3000);

function react(prev) {
  const a = prev && prev.round;
  const b = state.round;
  if (!b) return;
  if (!a || a.rid !== b.rid) return FX.play('sneak');
  if (a.phase === b.phase) return;
  if (b.phase === 'play' && a.phase === 'deal') FX.play('go');
  else if (b.phase === 'accuse') FX.play('gasp');
  else if (b.phase === 'final') FX.play('alarm');
  else if (b.phase === 'reveal') {
    FX.play('reveal');
    setTimeout(() => {
      FX.play(b.result.spiesWin ? 'wrong' : 'right');
      FX.confetti({ count: 200, colors: b.result.spiesWin ? ['#1f2937', '#f4c430', '#e11d48', '#ffffff'] : undefined });
    }, 900);
  }
}

const P = (id) => state.players[id] || UI.GONE;
const crowd = (ids, mark) =>
  `<div class="crowd">${ids.map((id) => `<span class="bounce" style="--c:${esc(P(id).color)}">${UI.avatarBubble(P(id), 'xxl')}<small>${mark ? mark(id) + ' ' : ''}${esc(P(id).name)}</small></span>`).join('')}</div>`;

function spotHtml() {
  const R = state.round;
  const single = state.settings.phones === 'single';
  if (!R) {
    if (single) return `<div class="tv-big">📱</div><div class="tv-msg">Partie sur un seul téléphone</div>${crowd(state.order)}`;
    return `<div class="tv-lobby"><div class="qrbox">${qrSvg(joinUrl)}</div><div class="tv-join"><p>Rejoins la partie !</p><p>Scanne le QR code</p><p>ou tape le code <b class="code">${room}</b></p></div></div>${crowd(state.order)}`;
  }
  switch (R.phase) {
    case 'deal':
      if (single) {
        const id = R.ids[R.deal];
        return `<div class="tv-msg small">🃏 Distribution des cartes</div><div class="tv-who" style="--c:${esc(P(id).color)}">${UI.avatarBubble(P(id), 'xxl')}<div class="tv-name">${esc(P(id).name)}</div></div><div class="tv-msg small">regarde sa carte… les autres, on ne regarde pas 🙈</div>`;
      }
      return `<div class="tv-big pulse">🃏</div><div class="tv-msg">Chacun découvre sa carte</div>${crowd(R.ids, (id) => (R.seen.includes(id) ? '✅' : '⏳'))}`;
    case 'play':
      return `<div class="bigclock tv ${R.paused ? 'paused' : ''}" data-clock>${UI.clockText(G.remaining(R, hostNow()))}</div>
        ${single ? `<div class="tv-msg small">🎤 ${esc(P(R.first).name)} pose la première question</div>` : `<div class="tv-msg small">${UI.turnHtml(state)}</div>`}
        <div class="pgrid tvgrid">${UI.placesHtml(R.places)}</div>`;
    case 'accuse': {
      const a = R.acc;
      if (single)
        return `<div class="accuse-head big">${UI.avatarBubble(P(a.by), 'xxl')}<span class="bang">🫵</span>${UI.avatarBubble(P(a.target), 'xxl')}</div><div class="tv-msg">${esc(P(a.by).name)} accuse ${esc(P(a.target).name)} !</div><div class="tv-msg small">Votez à main levée…</div>`;
      return `<div class="tv-acc">${UI.accusationHtml(state)}</div>`;
    }
    case 'final': {
      const voted = R.fvoted || [];
      return `<div class="tv-big pulse">⏰</div><div class="tv-msg">Temps écoulé ! Qui est l’espion ?</div>${single ? '<div class="tv-msg small">3, 2, 1… montrez du doigt !</div>' : crowd(R.ids, (id) => (voted.includes(id) ? '🗳️' : '⏳'))}`;
    }
    case 'reveal':
      return `<div class="tv-result">${UI.resultHtml(state)}</div>`;
  }
  return '';
}

let lastKey = '';
function render() {
  if (!state) return;
  const R = state.round;
  document.body.dataset.phase = R ? R.phase : 'lobby';
  $('#phase').textContent = UI.phaseLabel(state);
  const key = JSON.stringify([state.v]);
  if (key !== lastKey) {
    $('#spot').innerHTML = spotHtml();
    lastKey = key;
  }
  UI.flipRender($('#board'), UI.boardHtml(state, { online: state.settings.phones === 'single' ? null : online, last: R && R.phase === 'reveal' ? R.result.points : null }));
  const pod = $('#podium');
  pod.classList.toggle('open', !!state.podium);
  if (state.podium && pod.dataset.v !== String(state.v)) {
    pod.querySelector('.inner').innerHTML = UI.podiumHtml(state);
    pod.dataset.v = state.v;
  }
}

setInterval(() => {
  const R = state && state.round;
  if (!R) return;
  const left = G.remaining(R, hostNow());
  document.querySelectorAll('[data-clock]').forEach((el) => {
    el.textContent = UI.clockText(left);
    el.classList.toggle('hurry', R.phase === 'play' && !R.paused && left < 30000);
  });
}, 250);

$('#start').addEventListener('click', () => {
  FX.unlockAudio();
  FX.play('sneak');
  document.documentElement.requestFullscreen?.().catch(() => {});
  $('#start').remove();
});
keepAwake();

// Téléphone joueur (mode « un téléphone par joueur ») : ma carte secrète, le chrono,
// la liste des lieux à barrer, les accusations et les votes.
import { createTransport } from './transport.js';
import * as G from './game.js';
import { QUESTIONS, placeById } from './places.js';
import { getRoom, link, esc, $, toast, keepAwake, setConn, deviceId, resetDeviceId, profileStore, AVATARS, COLORS } from './common.js';
import * as UI from './ui.js';
import * as FX from './fx.js';
import { makeKeys, unseal } from './secure.js';

const room = getRoom();
if (!room) {
  location.replace(link('index.html'));
  await new Promise(() => {}); // stoppe le module pendant la redirection
}
const me = deviceId();
// Profil mémorisé : on ne rejoint tout seul que la MÊME salle (rechargement en cours de
// partie) ; pour une nouvelle partie, on redemande « Qui es-tu ? » (le téléphone a pu changer de mains).
const saved = profileStore.get();
let profile = saved && saved.room === room ? saved : null;
let state = null;
let skew = 0; // décalage entre l'horloge du maître du jeu et la nôtre
let online = false;
let hostOnline = null;
let hostSeenAt = 0;
let card = null; // ma carte pour la manche en cours
let keys = null;
let lastHello = 0;
let pick = [];
let onlineIds = new Set();
const startedAt = Date.now();
const ui = { cardSeen: false, idea: '', flow: null, fvote: null };
const hostNow = () => Date.now() + skew;

$('#roomCode').textContent = room;

const keysReady = makeKeys().then((k) => (keys = k));

const tr = createTransport(room, {
  key: 'p-' + me,
  meta: { role: 'player', id: me },
  onStatus: (s) => {
    online = s === 'online';
    setConn(s, tr.local);
    if (online) {
      tr.send('need-state', {});
      sayHello(true);
    }
  },
});

async function sayHello(force = false, extra = {}) {
  if (!profile || !online) return;
  if (!force && Date.now() - lastHello < 2500) return;
  lastHello = Date.now();
  await keysReady;
  tr.send('hello', { ...profile, id: me, role: 'player', pub: keys ? keys.pub : null, ...extra });
}
function act(a, d = {}) {
  tr.send('act', { id: me, a, d });
}

// ---------- Messages ----------
tr.on('state', ({ state: s, th, pick: pk }) => {
  if (Array.isArray(pk) && JSON.stringify(pk) !== JSON.stringify(pick)) {
    pick = pk;
    renderWho();
  }
  if (Number.isFinite(th)) skew = th - Date.now();
  hostSeenAt = Date.now();
  if (state && s.gid === state.gid && s.v <= state.v) return;
  const prev = state;
  state = s;
  onStateChange(prev);
  renderWho();
  render();
});

tr.on('card', async (m) => {
  if (m.to !== me) return;
  try {
    await keysReady;
    const c = await unseal(keys, m);
    if (!card || card.rid !== c.rid) ui.cardSeen = false;
    card = c;
    render(true);
  } catch {
    sayHello(true); // clé perdue (page rechargée) : on redemande la carte
  }
});

tr.on('join-err', ({ to, msg }) => {
  if (to !== me) return;
  toast(msg, 4000);
  FX.play('nope');
  draft = { ...draft, ...(profile || {}), rid: null };
  profile = null;
  renderJoin();
  $('#join').classList.add('open');
  render();
});

tr.on('fx', ({ kind, party }) => {
  if (kind === 'podium' && party) {
    FX.play('fanfare');
    FX.confetti({ count: 220 });
  }
});

tr.onPresence((list) => {
  onlineIds = new Set(list.filter((m) => m.role === 'player').map((m) => m.id));
  renderWho();
  const h = list.some((m) => m.role === 'host');
  if (h) hostSeenAt = Date.now();
  hostOnline = h;
  render();
});

const inRound = () => state && state.round && state.round.ids.includes(me);

/** Sons et vibrations selon ce qui vient de changer. */
function onStateChange(prev) {
  if (profile && !state.players[me] && !state.kicked.includes(me)) sayHello();
  const a = prev && prev.round;
  const b = state.round;
  if (!b) return;
  if (!a || a.rid !== b.rid) {
    ui.cardSeen = false;
    ui.fvote = null;
    ui.idea = '';
    closeFlow();
    if (card && card.rid !== b.rid) card = null;
    if (inRound()) {
      FX.play('sneak');
      FX.vibrate([60, 60, 60]);
      if (!card) sayHello(true);
    }
    return;
  }
  if (a.phase !== b.phase) {
    if (b.phase === 'play' && a.phase === 'deal') FX.play('go');
    else if (b.phase === 'accuse') {
      FX.play('gasp');
      FX.vibrate(b.acc && b.acc.target === me ? [300, 100, 300] : 120);
      closeFlow();
    } else if (b.phase === 'final') {
      FX.play('alarm');
      FX.vibrate([200, 100, 200, 100, 200]);
      closeFlow();
    } else if (b.phase === 'play' && a.phase === 'accuse') FX.play('nope');
    else if (b.phase === 'reveal') {
      closeFlow();
      FX.play('reveal');
      const res = b.result;
      const mine = (res.points && res.points[me]) || 0;
      setTimeout(() => {
        if (!inRound()) return;
        if (mine) {
          FX.play('right');
          FX.vibrate([60, 60, 60, 60, 200]);
          FX.confetti({ colors: res.spies.includes(me) ? ['#1f2937', '#f4c430', '#e11d48', '#ffffff'] : undefined });
        } else FX.play('wrong');
      }, 900);
    }
  } else if (b.phase === 'play' && b.turn && (!a.turn || a.turn.to !== b.turn.to) && b.turn.to === me) {
    FX.play('blip');
    FX.vibrate([80, 60, 80]);
  }
  if (!prev?.podium && state.podium) closeFlow();
}

// Carte manquante ou joueur pas encore inscrit : on se réannonce.
setInterval(() => {
  if (!state || !profile) return;
  const R = state.round;
  const needCard = inRound() && R.phase !== 'reveal' && (!card || card.rid !== R.rid);
  if ((!state.players[me] && !state.kicked.includes(me)) || needCard) sayHello();
}, 3000);

// ---------- Actions ----------
document.addEventListener('click', (e) => {
  FX.unlockAudio();
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) {
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'seen':
        act('seen');
        b.disabled = true;
        return;
      case 'ask':
        act('ask', { to: id });
        return;
      case 'idea': {
        let q;
        do q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        while (q === ui.idea && QUESTIONS.length > 1);
        ui.idea = q;
        return render(true);
      }
      case 'accuse':
        return openFlow({ type: 'acc' });
      case 'spy':
        return openFlow({ type: 'spy' });
      case 'yes':
      case 'no':
        act('vote', { yes: b.dataset.act === 'yes' });
        ui.myVote = b.dataset.act === 'yes';
        return;
      case 'fvote':
        ui.fvote = id;
        act('fvote', { target: id });
        return render(true);
      case 'fTarget':
        ui.flow.target = id;
        return renderFlow();
      case 'fOk': {
        const f = ui.flow;
        closeFlow();
        if (f.type === 'acc') act('accuse', { target: f.target });
        else act('guess', { place: f.place });
        return;
      }
      case 'close':
        return closeFlow();
    }
  }
  const t = e.target.closest('[data-place]');
  if (!t) return;
  if (t.closest('#flowBody')) {
    ui.flow.place = t.dataset.place;
    return renderFlow();
  }
  // Barrer / débarrer un lieu (aide-mémoire, rien n'est envoyé)
  const x = crossed();
  const p = t.dataset.place;
  x.has(p) ? x.delete(p) : x.add(p);
  saveCrossed(x);
  t.classList.toggle('x');
});

function crossed() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem('lieu-x:' + state.round.rid) || '[]'));
  } catch {
    return new Set();
  }
}
function saveCrossed(x) {
  try {
    sessionStorage.setItem('lieu-x:' + state.round.rid, JSON.stringify([...x]));
  } catch {}
}

// ---------- Fenêtres : accuser, l'espion se dévoile ----------
function openFlow(f) {
  ui.flow = f;
  renderFlow();
  $('#flowModal').classList.add('open');
}
function closeFlow() {
  ui.flow = null;
  $('#flowModal').classList.remove('open');
}
$('#flowModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeFlow();
});

function renderFlow() {
  const f = ui.flow;
  const R = state && state.round;
  if (!f || !R) return closeFlow();
  let html;
  if (f.type === 'acc') {
    html = `<h2>🫵 J’accuse…</h2><p class="muted">Qui est l’espion d’après toi ?</p>
      ${UI.playerChips(state, R.ids.filter((id) => id !== me), { act: 'fTarget', sel: f.target })}
      <p class="muted small">Le chrono s’arrête et tout le monde vote. ${state.settings.vote === 'majority' ? 'La majorité suffit.' : 'Il faut que tout le monde soit d’accord.'} Tu n’as droit qu’à une accusation par manche !</p>
      <button class="btn ko big" data-act="fOk" ${f.target ? '' : 'disabled'}>🫵 Accuser ${f.target ? esc(state.players[f.target]?.name || '') : ''}</button>`;
  } else if (card && !card.spy) {
    html = `<h2>🕵️ Je suis l’espion…</h2><p class="big-txt">Tu n’es pas l’espion 😉</p>
      <p class="muted">Ce bouton est là pour tout le monde : comme ça, personne ne peut repérer l’espion en regardant son écran.</p>`;
  } else {
    const pl = f.place && placeById(f.place);
    html = `<h2>🕵️ Je sais où on est !</h2><p class="muted small">Une seule tentative : si tu te trompes, les autres gagnent.</p>
      <div class="pgrid">${UI.placesHtml(R.places, { mode: 'pick', sel: f.place, crossed: crossed() })}</div>
      <div class="sticky-ok"><button class="btn go big" data-act="fOk" ${f.place ? '' : 'disabled'}>${pl ? `C’est ${esc(pl.name.toLowerCase())} !` : 'Choisis un lieu'}</button></div>`;
  }
  $('#flowBody').innerHTML = html + '<button class="btn ghost" data-act="close">Annuler</button>';
}

// ---------- Rendu ----------
const P = (id) => state.players[id] || UI.GONE;
const clock = (cls = '') => `<div class="bigclock ${cls}" data-clock>${UI.clockText(G.remaining(state.round, hostNow()))}</div>`;

function viewHtml() {
  if (!state) {
    return `<div class="status"><div class="st-title">Connexion…</div><div class="st-sub">${Date.now() - startedAt > 4000 ? `En attente du maître du jeu (salle ${room})` : 'Recherche de la partie'}</div></div>`;
  }
  const p = state.players[me];
  if (!p) return `<div class="status"><div class="st-title">Inscription…</div><div class="st-sub">Connexion au maître du jeu</div></div>`;
  const R = state.round;
  if (!R) {
    const crowd = state.order.map((id) => `<span class="crowd-p" style="--c:${esc(P(id).color)}">${UI.avatarBubble(P(id))}<small>${esc(P(id).name)}</small></span>`).join('');
    return `<div class="status"><div class="st-title">Tu es inscrit·e ! 🎉</div><div class="st-sub">La partie va commencer. Tu n’es pas ${esc(p.name)} ? Touche ton prénom en haut.</div></div>
      <div class="card"><div class="crowd-row">${crowd}</div></div>`;
  }
  if (!inRound()) {
    if (R.phase === 'reveal') return UI.resultHtml(state);
    return `<div class="status"><div class="st-title">Une manche est en cours</div><div class="st-sub">Tu joueras à la prochaine 🙂</div></div>${clock()}`;
  }
  const hasCard = card && card.rid === R.rid;
  const cardWait = '<div class="status"><div class="st-title">⏳ Réception de ta carte…</div></div>';
  switch (R.phase) {
    case 'deal': {
      const seen = R.seen.includes(me);
      return `<div class="status"><div class="st-title">🃏 Ta carte secrète</div><div class="st-sub">Cache bien ton écran !</div></div>
        ${hasCard ? UI.holdCardHtml(card) : cardWait}
        <button class="btn huge go" data-act="seen" id="seenBtn" ${!seen && hasCard && ui.cardSeen ? '' : 'disabled'}>${seen ? '✅ Carte vue' : 'J’ai vu ma carte ✓'}</button>
        <p class="muted center">${seen ? `En attente des autres (${R.seen.length} / ${R.ids.length})…` : 'Garde ton doigt sur la carte pour la retourner.'}</p>`;
    }
    case 'play': {
      const { asker, forbidden } = G.askerInfo(R);
      let turn;
      if (asker === me) {
        const intro = R.turn.to === me ? `❓ <b>${esc(P(R.turn.from).name)}</b> t’interroge : réponds, puis choisis à qui tu poses ta question.` : '🎤 C’est toi qui commences ! À qui poses-tu ta question ?';
        turn = `<div class="myturn"><p>${intro}</p>${UI.playerChips(state, R.ids.filter((id) => id !== me), { act: 'ask', dis: forbidden ? [forbidden] : [] })}
          <button class="btn ghost" data-act="idea">💡 Une idée de question</button>${ui.idea ? `<p class="idea-q">« ${esc(ui.idea)} »</p>` : ''}</div>`;
      } else turn = `<p class="turn-line">${UI.turnHtml(state)}</p>`;
      const x = crossed();
      return `${clock(R.paused ? 'paused' : '')}${R.paused ? '<p class="center muted">⏸ Pause</p>' : ''}
        ${turn}
        ${hasCard ? UI.holdCardHtml(card, { compact: true, hint: 'Garde ton doigt ici pour revoir ta carte' }) : cardWait}
        <div class="row"><button class="btn ko" data-act="accuse" ${R.accusedBy.includes(me) ? 'disabled' : ''}>🫵 J’accuse…</button><button class="btn" data-act="spy">🕵️ Je suis l’espion…</button></div>
        <div class="card"><h3 class="sec-title">🗺️ Les lieux possibles <small>· touche pour barrer</small></h3><div class="pgrid">${UI.placesHtml(R.places, { crossed: x, mode: 'cross' })}</div></div>`;
    }
    case 'accuse': {
      const a = R.acc;
      let mine = '';
      if (a.target === me) mine = '<p class="big-txt warn-txt">😬 On t’accuse ! Défends-toi !</p>';
      else if (a.by === me) mine = `<p class="muted">Tu as accusé ${esc(P(a.target).name)}. Attends le vote…</p>`;
      else {
        const v = a.votes[me];
        mine = `<p class="big-txt">${esc(P(a.target).name)} est l’espion ?</p>
          <div class="judge"><button class="btn huge ok ${v === true ? 'picked' : ''}" data-act="yes">👍 Oui</button><button class="btn huge ko ${v === false ? 'picked' : ''}" data-act="no">👎 Non</button></div>
          ${v != null ? '<p class="muted center small">Tu peux changer d’avis tant que le vote n’est pas fini.</p>' : ''}`;
      }
      return `<div class="card stage">${UI.accusationHtml(state)}${mine}</div>`;
    }
    case 'final': {
      const voted = (R.fvoted || []).includes(me);
      return `<div class="status"><div class="st-title">⏰ Temps écoulé !</div><div class="st-sub">Qui est l’espion ? ${voted ? '✅ Vote envoyé (tu peux changer)' : 'Vote en secret'}</div></div>
        ${UI.playerChips(state, R.ids.filter((id) => id !== me), { act: 'fvote', sel: ui.fvote })}
        <p class="muted center">${(R.fvoted || []).length} / ${R.ids.length} ont voté</p>
        <button class="btn" data-act="spy">🕵️ Je suis l’espion…</button>
        ${hasCard ? UI.holdCardHtml(card, { compact: true, hint: 'Garde ton doigt ici pour revoir ta carte' }) : ''}`;
    }
    case 'reveal':
      return `${UI.resultHtml(state, { me })}<p class="muted center">La prochaine manche arrive…</p>`;
  }
  return '';
}

let lastKey = '';
let pending = false;
function render(force = false) {
  const joinOpen = !profile || $('#join').classList.contains('open');
  document.body.classList.toggle('joining', joinOpen);
  // Pas de reconstruction pendant qu'on garde le doigt sur sa carte.
  if (document.querySelector('.hold.on')) {
    pending = true;
    return;
  }
  const R = state && state.round;
  const key = JSON.stringify([state && state.v, card && card.rid, ui.cardSeen, ui.idea, ui.fvote, !!state, state && !!state.players[me], Math.floor((Date.now() - startedAt) / 4000) < 2]);
  if (force || key !== lastKey) {
    $('#view').innerHTML = viewHtml();
    $('#view').dataset.phase = R ? R.phase : 'lobby';
    lastKey = key;
  }
  if (!state) return;
  const kicked = state.kicked.includes(me) && !state.players[me];
  $('#kicked').hidden = !kicked;
  const p = state.players[me];
  if (p) {
    $('#meAv').textContent = p.avatar;
    $('#meAv').style.setProperty('--c', p.color);
    $('#meName').textContent = p.name;
    $('#meScore').textContent = p.score;
  }
  $('#hostOff').hidden = hostOnline !== false || Date.now() - hostSeenAt < 4000;
  const showBoard = !R || R.phase === 'reveal';
  $('#boardCard').hidden = !showBoard || !state.rounds.length;
  if (showBoard) UI.flipRender($('#board'), UI.boardHtml(state, { me, last: R && R.phase === 'reveal' ? R.result.points : null }));
  const pod = $('#podium');
  pod.classList.toggle('open', !!state.podium);
  if (state.podium && pod.dataset.v !== String(state.v)) {
    pod.querySelector('.inner').innerHTML = UI.podiumHtml(state);
    pod.dataset.v = state.v;
  }
}
document.addEventListener('pointerup', () => {
  if (pending) {
    pending = false;
    setTimeout(() => render(true), 50);
  }
});

UI.bindHold($('#view'), () => {
  ui.cardSeen = true;
  const b = $('#seenBtn');
  if (b && state && state.round && !state.round.seen.includes(me)) b.disabled = false;
});

// Chrono
setInterval(() => {
  if (!state) return render();
  const R = state.round;
  if (!R) return;
  const left = G.remaining(R, hostNow());
  document.querySelectorAll('[data-clock]').forEach((el) => {
    el.textContent = UI.clockText(left);
    el.classList.toggle('hurry', R.phase === 'play' && !R.paused && left < 30000);
  });
  $('#hostOff').hidden = hostOnline !== false || Date.now() - hostSeenAt < 4000;
}, 250);

// ---------- Inscription ----------
const form = $('#joinForm');
let draft = {
  name: saved?.name || '',
  avatar: saved?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)],
  color: saved?.color || COLORS[Math.floor(Math.random() * COLORS.length)],
  rid: saved?.rid || null, // joueur enregistré choisi dans « Qui es-tu ? »
};
const sameName = (a, b) => String(a).trim().toLocaleLowerCase('fr') === String(b).trim().toLocaleLowerCase('fr');
function takenBy(name) {
  if (!state) return null;
  return Object.values(state.players).find((p) => p.id !== me && (onlineIds.has(p.id) || p.id.startsWith('host-')) && sameName(p.name, name)) || null;
}

function renderWho() {
  const box = $('#who');
  if (!box) return;
  const list = pick.filter((p) => !takenBy(p.name));
  box.hidden = !list.length;
  $('#whoList').innerHTML = list
    .map((p) => `<button type="button" class="who-chip ${draft.rid === p.id ? 'on' : ''}" data-rid="${esc(p.id)}" style="--c:${esc(p.color)}"><span class="av" style="--c:${esc(p.color)}">${esc(p.avatar)}</span>${esc(p.name)}</button>`)
    .join('');
  $('#nameLbl').firstChild.textContent = list.length ? 'Ou écris ton prénom' : 'Prénom';
}

function renderJoin() {
  form.name.value = draft.name;
  $('#joinTitle').textContent = profile ? 'Qui joue sur ce téléphone ?' : 'Qui es-tu ?';
  $('#joinHint').hidden = !profile;
  $('#joinHint').textContent = profile ? `Tu passes le téléphone ? Choisis un autre prénom : ${profile.name} garde ses points.` : '';
  renderWho();
  $('#avatars').innerHTML = AVATARS.map((a) => `<button type="button" class="pick ${a === draft.avatar ? 'on' : ''}" data-av="${a}">${a}</button>`).join('');
  $('#colors').innerHTML = COLORS.map((c) => `<button type="button" class="swatch ${c === draft.color ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Couleur ${c}"></button>`).join('');
  $('#preview').style.setProperty('--c', draft.color);
  $('#preview').textContent = draft.avatar;
}
form.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  FX.unlockAudio();
  if (b.dataset.rid) {
    const p = pick.find((x) => x.id === b.dataset.rid);
    if (p) draft = { ...draft, name: p.name, avatar: p.avatar, color: p.color, rid: p.id };
    renderJoin();
    return;
  }
  if (b.dataset.av) draft.avatar = b.dataset.av;
  if (b.dataset.color) draft.color = b.dataset.color;
  draft.name = form.name.value;
  renderJoin();
});
form.name.addEventListener('input', () => {
  draft.name = form.name.value;
  const p = draft.rid && pick.find((x) => x.id === draft.rid);
  if (draft.rid && (!p || !sameName(p.name, draft.name))) {
    draft.rid = null;
    renderWho();
  }
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  FX.unlockAudio();
  const name = form.name.value.trim();
  if (!name) {
    form.name.focus();
    toast('Ton prénom d’abord 😉');
    return;
  }
  const other = takenBy(name);
  if (other) {
    toast(`${other.name} est déjà dans la partie 🙂 Choisis un autre prénom.`, 3500);
    return;
  }
  const rp = draft.rid && pick.find((x) => x.id === draft.rid);
  const next = { ...draft, name: name.slice(0, 16), rid: rp && sameName(rp.name, name) ? rp.id : null, room };
  if (profile && !sameName(profile.name, next.name)) {
    // Le téléphone passe à quelqu'un d'autre : nouvelle identité (l'ancien joueur
    // garde ses points dans la partie), puis on recharge pour repartir proprement.
    profileStore.set(next);
    resetDeviceId();
    location.reload();
    return;
  }
  profile = next;
  profileStore.set(profile);
  $('#join').classList.remove('open');
  FX.play('join');
  sayHello(true);
  render(true);
});
$('#editProfile').addEventListener('click', () => {
  if (profile) draft = { ...profile };
  renderJoin();
  $('#join').classList.add('open');
  render();
});
$('#rejoin').addEventListener('click', () => sayHello(true, { rejoin: true }));

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tr.send('need-state', {});
    sayHello(true);
  }
});

renderJoin();
if (!profile) $('#join').classList.add('open');
render(true);
keepAwake();

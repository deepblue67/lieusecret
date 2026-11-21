// Maître du jeu : c'est lui qui fait foi. Il garde le lieu et les espions, diffuse
// l'état public et envoie à chaque joueur sa carte, chiffrée pour lui seul.
// Deux modes : un téléphone par joueur, ou un seul téléphone qui passe de main en main.
import { createTransport } from './transport.js';
import * as G from './game.js';
import { PACKS, PLACES, QUESTIONS, placeById } from './places.js';
import { now, getRoom, makeRoomCode, link, absUrl, store, esc, $, toast, keepAwake, setConn, qrSvg, AVATARS, COLORS, deviceId } from './common.js';
import { createRosterStore } from './roster.js';
import * as UI from './ui.js';
import * as FX from './fx.js';
import { makeKeys, seal } from './secure.js';

// ---------- Salle ----------
const room = getRoom();
if (!room) {
  location.replace(link('host.html', { r: makeRoomCode() }));
  await new Promise(() => {}); // stoppe le module pendant la redirection
}
const SAVE_KEY = 'lieu-host:' + room;
store.set('lieu-last-host-room', room);

const roster = createRosterStore(store); // joueurs enregistrés et groupes (sur ce téléphone)
let state = store.get(SAVE_KEY) || G.newGame(room, store.get('lieu-settings', {}));
state.settings = { ...G.DEFAULT_SETTINGS, ...state.settings };
if (state.settings.group && !roster.group(state.settings.group)) state.settings.group = '';
const hostPid = 'host-' + deviceId(); // le maître du jeu, quand il joue aussi (mode un par joueur)
const undoStack = [];
const pubs = new Map(); // id joueur -> clé publique (null : téléphone sans chiffrement)
let online = new Set();
let keys = null;
let soundOn = store.get('lieu-host-sound', true);
FX.setMuted(!soundOn);
const inst = G.randomId(6);
const joinUrl = absUrl('play.html', { r: room });
const tvUrl = absUrl('tv.html', { r: room });

// État de l'écran (pas partagé)
const ui = {
  peek: false, // un téléphone : le joueur a confirmé que c'est bien lui
  peekSeen: false, // il a retourné sa carte
  mySeen: false, // le maître du jeu (s'il joue) a retourné sa carte
  flow: null, // fenêtre en cours : accusation, l'espion se dévoile…
  idea: '',
  crossed: new Set(),
  fixing: false,
};

const tr = createTransport(room, {
  key: 'host-' + inst,
  meta: { role: 'host', inst },
  onStatus: (s) => {
    setConn(s, tr.local);
    if (s === 'online') {
      broadcastState();
      sendAllCards();
    }
  },
});

const single = () => state.settings.phones === 'single';
const hostPlays = () => !single() && !!state.players[hostPid];

// ---------- Diffusion ----------
let bcTimer = null;
function broadcastState() {
  clearTimeout(bcTimer);
  bcTimer = setTimeout(() => tr.send('state', { state: G.publicState(state), th: now(), pick: pickList() }), 25);
}

/** Prénoms proposés dans le « Qui es-tu ? » des téléphones. */
function pickList() {
  if (single()) return [];
  const mine = state.players[hostPid]?.rid;
  return roster
    .inGroup(state.settings.group)
    .filter((p) => p.id !== mine)
    .map(({ id, name, avatar, color }) => ({ id, name, avatar, color }));
}

async function sendCard(id) {
  if (id === hostPid || single() || !pubs.has(id)) return;
  const card = G.cardFor(state, id);
  if (!card) return;
  const sealed = await seal(keys, pubs.get(id), card);
  tr.send('card', { to: id, ...sealed });
}
function sendAllCards() {
  if (state.round && state.round.phase !== 'reveal') state.round.ids.forEach(sendCard);
}

function fx(kind, extra = {}) {
  tr.send('fx', { kind, ...extra });
}

/** Joueurs présents : connectés, plus le maître du jeu s'il joue (tout le monde en mode un téléphone). */
function present() {
  if (single()) return null;
  const list = [...online].filter((id) => state.players[id]);
  if (hostPlays()) list.push(hostPid);
  return list;
}

function commit(next, { undo = false } = {}) {
  if (!next || next === state) return false;
  if (undo) {
    undoStack.push(state);
    if (undoStack.length > 40) undoStack.shift();
  }
  const prev = state;
  next.v = state.v + 1;
  state = next;
  store.set(SAVE_KEY, state);
  onTransition(prev);
  render();
  broadcastState();
  return true;
}

/** Sons, effets et cartes selon le changement de phase. */
function onTransition(prev) {
  const a = prev.round;
  const b = state.round;
  if (b && (!a || a.rid !== b.rid)) {
    ui.peek = false;
    ui.peekSeen = false;
    ui.mySeen = false;
    ui.crossed = new Set();
    ui.flow = null;
    closeModal();
    sendAllCards();
    FX.play('sneak');
    fx('deal');
    return;
  }
  if (!b || !a) return;
  if (a.phase === b.phase) {
    if (b.turn && a.turn && b.turn.to !== a.turn.to && b.turn.to) fx('ask', { to: b.turn.to });
    return;
  }
  if (b.phase === 'play' && a.phase === 'deal') {
    FX.play('go');
    fx('start');
  } else if (b.phase === 'accuse') {
    FX.play('gasp');
    fx('gasp');
  } else if (b.phase === 'final') {
    FX.play('alarm');
    FX.vibrate([200, 100, 200]);
    fx('alarm');
  } else if (b.phase === 'play' && a.phase === 'accuse') {
    FX.play('nope');
    fx('resume');
  } else if (b.phase === 'reveal') {
    const res = b.result;
    FX.play('reveal');
    setTimeout(() => {
      FX.play(res.spiesWin ? 'wrong' : 'right');
      if (!res.spiesWin || single()) FX.confetti({ colors: res.spiesWin ? ['#1f2937', '#f4c430', '#e11d48'] : undefined });
    }, 900);
    fx('reveal', { spiesWin: res.spiesWin });
  }
  if (b.phase !== 'deal') ui.peek = false;
}

// ---------- Messages des téléphones ----------
tr.on('need-state', () => {
  broadcastState();
});

const sameName = (a, b) => String(a).trim().toLocaleLowerCase('fr') === String(b).trim().toLocaleLowerCase('fr');

tr.on('hello', (m) => {
  if (m.role === 'tv') return broadcastState();
  if (!m.id) return;
  if (single()) return tr.send('join-err', { to: m.id, msg: 'Cette partie se joue sur un seul téléphone 📱 Regarde celui du maître du jeu !' });
  pubs.set(m.id, m.pub || null);
  const name = String(m.name || '').trim().slice(0, 16);
  if (!name) return;
  // Un prénom = un joueur : refusé si quelqu'un de connecté l'utilise déjà ; sinon
  // (ancien téléphone déconnecté) ce téléphone reprend sa place, ses points et sa carte.
  let base = state;
  const clash = Object.values(state.players).find((p) => p.id !== m.id && sameName(p.name, name));
  if (clash) {
    if (clash.id === hostPid || online.has(clash.id)) return tr.send('join-err', { to: m.id, msg: `${clash.name} est déjà dans la partie 🙂 Choisis un autre prénom.` });
    base = G.movePlayer(state, clash.id, m.id);
  }
  const isNew = !state.players[m.id] && !clash;
  const next = G.upsertPlayer(base, { ...m, name }, { rejoin: !!m.rejoin });
  if (!next) {
    if (Object.keys(state.players).length >= G.MAX_PLAYERS && !state.kicked.includes(m.id)) tr.send('join-err', { to: m.id, msg: 'La partie est complète (12 joueurs maximum) 😕' });
    return broadcastState();
  }
  // Joueur enregistré qui change son animal ou sa couleur sur son téléphone : on le retient.
  const r = m.rid && roster.players.find((x) => x.id === m.rid);
  if (r && sameName(r.name, name) && (r.avatar !== m.avatar || r.color !== m.color)) roster.update(r.id, { avatar: m.avatar, color: m.color });
  const changed = base !== state || JSON.stringify(next.players[m.id]) !== JSON.stringify(state.players[m.id]) || next.kicked.length !== state.kicked.length;
  if (changed) {
    commit(next);
    if (isNew) {
      FX.play('join');
      fx('join', { id: m.id });
    }
  } else broadcastState();
  sendCard(m.id);
});

tr.on('act', (m) => {
  if (!m || !m.id || !state.players[m.id] || m.id === hostPid) return;
  handleAct(m.id, m.a, m.d || {});
});

/** Action d'un joueur (venue de son téléphone, ou du maître du jeu quand il joue). */
function handleAct(id, a, d) {
  const t = now();
  let next = null;
  switch (a) {
    case 'seen':
      next = G.markSeen(state, id, t);
      break;
    case 'ask':
      next = G.ask(state, id, d.to);
      break;
    case 'accuse':
      next = G.accuse(state, id, d.target, t);
      break;
    case 'vote':
      next = G.vote(state, id, d.yes);
      break;
    case 'fvote':
      next = G.finalVote(state, id, d.target);
      break;
    case 'guess':
      next = G.spyGuess(state, id, d.place);
      break;
  }
  if (!next) return broadcastState(); // action refusée : le téléphone se recale sur l'état réel
  commit(next, { undo: a === 'accuse' || a === 'guess' });
  autoClose();
}

/** Tout le monde a voté : on dépouille (après une petite seconde de suspense). */
let closeTimer = null;
function autoClose() {
  clearTimeout(closeTimer);
  const R = state.round;
  if (!R) return;
  const key = R.rid + ':' + R.phase + ':' + (R.acc ? R.acc.by + R.acc.target : '');
  if (R.phase === 'accuse' && G.accusationComplete(R, present())) {
    closeTimer = setTimeout(() => {
      if (state.round && state.round.rid + ':' + state.round.phase + ':' + (state.round.acc ? state.round.acc.by + state.round.acc.target : '') === key) {
        commit(G.closeAccusation(state, now(), { present: present() }), { undo: true });
      }
    }, 1400);
  } else if (R.phase === 'final' && G.finalComplete(R, present())) {
    closeTimer = setTimeout(() => {
      if (state.round && state.round.phase === 'final' && state.round.rid === R.rid) commit(G.closeFinal(state, { present: present() }), { undo: true });
    }, 1400);
  }
}

tr.onPresence((list) => {
  online = new Set(list.filter((m) => m.role === 'player').map((m) => m.id));
  $('#dupHost').hidden = !list.some((m) => m.role === 'host' && m.inst !== inst);
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') broadcastState();
});
setInterval(broadcastState, 5000);

// ---------- Préparer la partie ----------

/** Joueurs du mode un téléphone : sélection parmi les joueurs enregistrés du groupe. */
function selection() {
  const sel = store.get('lieu-selection', []);
  return roster.inGroup(state.settings.group).filter((p) => sel.includes(p.id));
}
function syncSinglePlayers() {
  if (!single() || (state.round && state.round.phase !== 'reveal')) return;
  const list = selection();
  const same = JSON.stringify(list.map((p) => [p.id, p.name, p.avatar, p.color])) === JSON.stringify(state.order.map((id) => [id, state.players[id]?.name, state.players[id]?.avatar, state.players[id]?.color]));
  if (!same) commit(G.setPlayers(state, list));
}

/** Le maître du jeu joue (ou non) : il apparaît comme un joueur de la partie. */
function setHostPlayer(rid) {
  store.set('lieu-host-play', rid || '');
  const r = rid && roster.players.find((p) => p.id === rid);
  if (r) {
    const clash = Object.values(state.players).find((p) => p.id !== hostPid && sameName(p.name, r.name));
    if (clash) return toast(`${clash.name} est déjà connecté·e sur un autre téléphone`);
    commit(G.upsertPlayer(state, { id: hostPid, name: r.name, avatar: r.avatar, color: r.color, rid: r.id }, { rejoin: true }));
  } else if (state.players[hostPid]) {
    const s = G.kick(state, hostPid);
    s.kicked = s.kicked.filter((x) => x !== hostPid);
    commit(s);
  }
}

function roundIds() {
  if (single()) return state.order;
  return state.order.filter((id) => id === hostPid || online.has(id));
}

function startRound({ keepN = false } = {}) {
  const ids = roundIds();
  if (ids.length < G.MIN_PLAYERS) return toast(`Il faut au moins ${G.MIN_PLAYERS} joueurs ${single() ? '' : 'connectés '}🙂`);
  const sc = G.spyCount(state.settings, ids.length);
  if (sc.reduced) toast('Pas assez de joueurs pour 2 espions : 1 seul espion cette manche');
  commit(G.startRound(state, ids, now(), { keepN }), { undo: !keepN && !!state.round });
}

/** Changer de mode de jeu (les scores repartent de zéro). */
function setMode(phones) {
  if (phones === state.settings.phones) return;
  const played = state.rounds.length || (state.round && state.round.phase !== 'reveal');
  if (played && !confirm('Changer de mode arrête la partie en cours et remet les scores à zéro. On change ?')) return syncSettingsForm();
  saveSettings({ phones });
  let s = G.resetScores(G.setSettings(state, { phones }));
  if (phones === 'single') s = G.setPlayers(s, selection());
  else {
    s = G.setPlayers(s, []);
    const rid = store.get('lieu-host-play', '');
    const r = rid && roster.players.find((p) => p.id === rid);
    if (r) s = G.upsertPlayer(s, { id: hostPid, name: r.name, avatar: r.avatar, color: r.color, rid: r.id }, { rejoin: true });
  }
  undoStack.length = 0;
  commit(s);
}

function saveSettings(patch) {
  const keep = { ...store.get('lieu-settings', {}), ...patch };
  delete keep.group;
  store.set('lieu-settings', keep);
}

// ---------- Actions ----------
const actions = {
  start: () => startRound(),
  next: () => startRound(),
  redeal() {
    if (!confirm('Redistribuer de nouvelles cartes (nouveau lieu, nouvel espion) ? Les points ne changent pas.')) return;
    startRound({ keepN: true });
  },
  forceStart: () => commit(G.forceStart(state, now())),
  pause: () => commit(G.togglePause(state, now())),
  timeup() {
    if (!confirm('Arrêter le chrono et passer au vote final ?')) return;
    const s = G.setSettings(state, {});
    s.round.endsAt = now();
    s.round.paused = false;
    commit(G.timeUp(s, now()), { undo: true });
  },
  idea() {
    let q;
    do q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    while (q === ui.idea && QUESTIONS.length > 1);
    ui.idea = q;
    render(true);
  },
  // Un téléphone : distribution
  peek() {
    ui.peek = true;
    ui.peekSeen = false;
    render(true);
  },
  dealNext() {
    ui.peek = false;
    commit(G.dealNext(state, now()));
  },
  // Un téléphone : accusation / vote final à main levée
  accYes: () => commit(G.closeAccusation(state, now(), { decided: true }), { undo: true }),
  accNo: () => commit(G.closeAccusation(state, now(), { decided: false }), { undo: true }),
  closeAcc: () => commit(G.closeAccusation(state, now(), { present: present() }), { undo: true }),
  closeFinal: () => commit(G.closeFinal(state, { present: present() }), { undo: true }),
  finalNone: () => commit(G.closeFinal(state, { decided: '' }), { undo: true }),
  // Le maître du jeu joue aussi
  mySeen: () => handleAct(hostPid, 'seen', {}),
  myYes: () => handleAct(hostPid, 'vote', { yes: true }),
  myNo: () => handleAct(hostPid, 'vote', { yes: false }),
  // Fenêtres
  accStart: () => openFlow({ type: 'acc', step: 1 }),
  spyStart: () => openFlow({ type: 'spy', step: 1 }),
  myAccuse: () => openFlow({ type: 'myAcc', step: 2, by: hostPid }),
  mySpy: () => openFlow({ type: 'spy', step: 2, by: hostPid, mine: true }),
  undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    commit(structuredClone(prev));
    sendAllCards();
    toast('↩️ Action annulée');
  },
  podium() {
    if (!state.rounds.length) return toast('Aucune manche n’a encore été jouée 🙂');
    if (state.round && state.round.phase !== 'reveal' && !confirm('La manche en cours n’est pas finie. Afficher le podium quand même ?')) return;
    commit(G.setPodium(state, true), { undo: true });
    const party = Object.values(state.players).some((p) => p.score > 0);
    if (party) {
      FX.play('fanfare');
      FX.confetti({ count: 240 });
    }
    fx('podium', { party });
  },
  unpodium: () => commit(G.setPodium(state, false)),
  reset() {
    if (!confirm('Nouvelle partie : les scores repartent de zéro (les joueurs restent). On y va ?')) return;
    commit(G.resetScores(state), { undo: true });
    closeModal();
    toast('Nouvelle partie !');
  },
  newroom() {
    if (!confirm('Créer une nouvelle salle ? Les joueurs devront rescanner le QR code.')) return;
    location.href = link('host.html', { r: makeRoomCode() });
  },
  qr: () => openModal('#qrModal'),
  settings() {
    syncSettingsForm();
    openModal('#setModal');
  },
  close: () => closeModal(),
  fix() {
    ui.fixing = !ui.fixing;
    render();
  },
};

document.addEventListener('click', (e) => {
  FX.unlockAudio();
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) {
    const act = b.dataset.act;
    const id = b.dataset.id;
    if (rosterActs[act]) return rosterActs[act](b);
    if (flowActs[act]) return flowActs[act](b);
    switch (act) {
      case 'mode':
        return setMode(b.dataset.v);
      case 'group':
        store.set('lieu-group', b.dataset.g);
        commit(G.setSettings(state, { group: b.dataset.g }));
        return syncSinglePlayers();
      case 'sel': {
        const sel = new Set(store.get('lieu-selection', []));
        sel.has(id) ? sel.delete(id) : sel.add(id);
        store.set('lieu-selection', [...sel]);
        syncSinglePlayers();
        return render(true);
      }
      case 'hostPlay':
        return setHostPlayer(b.dataset.id);
      case 'plus':
        return commit(G.adjustScore(state, id, 1), { undo: true });
      case 'minus':
        return commit(G.adjustScore(state, id, -1), { undo: true });
      case 'kick': {
        const p = state.players[id];
        if (p && confirm(`Exclure ${p.name} de la partie ?`)) commit(G.kick(state, id), { undo: true });
        return;
      }
      case 'myAsk':
        return handleAct(hostPid, 'ask', { to: id });
      case 'myVote':
        return handleAct(hostPid, 'fvote', { target: id });
      case 'finalPick':
        return commit(G.closeFinal(state, { decided: id }), { undo: true });
    }
    return actions[act]?.(b);
  }
  // Le maître du jeu (s'il joue) barre les lieux de sa liste
  const t = e.target.closest('#stage [data-place]');
  if (t && hostPlays()) {
    const p = t.dataset.place;
    ui.crossed.has(p) ? ui.crossed.delete(p) : ui.crossed.add(p);
    t.classList.toggle('x');
  }
});

// Ajout rapide d'un joueur (mode un téléphone)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'quickAdd') quickAdd();
});
document.addEventListener('click', (e) => {
  if (e.target.closest('#quickAddBtn')) quickAdd();
});
function quickAdd() {
  const el = $('#quickAdd');
  if (!el) return;
  try {
    const used = roster.players;
    const p = roster.add(el.value, {
      groupId: state.settings.group,
      avatar: AVATARS.find((a) => !used.some((x) => x.avatar === a)),
      color: COLORS.find((c) => !used.some((x) => x.color === c)) || COLORS[used.length % COLORS.length],
    });
    store.set('lieu-selection', [...new Set([...store.get('lieu-selection', []), p.id])]);
    el.value = '';
    syncSinglePlayers();
    render(true);
    setTimeout(() => $('#quickAdd')?.focus(), 0);
  } catch (err) {
    toast(err.message);
  }
}

// ---------- Fenêtres : accusation, l'espion se dévoile ----------
function openFlow(f) {
  ui.flow = f;
  renderFlow();
  openModal('#flowModal');
}
const flowActs = {
  fBy(b) {
    ui.flow.by = b.dataset.id;
    ui.flow.step = 2;
    renderFlow();
  },
  fTarget(b) {
    ui.flow.target = b.dataset.id;
    renderFlow();
  },
  fPlace(b) {
    ui.flow.place = b.dataset.place;
    renderFlow();
  },
  fBack() {
    ui.flow.step = 1;
    ui.flow.target = ui.flow.place = null;
    renderFlow();
  },
  fOk() {
    const f = ui.flow;
    closeModal();
    ui.flow = null;
    if (f.type === 'myAcc') return handleAct(hostPid, 'accuse', { target: f.target });
    if (f.type === 'acc') return commit(G.accuse(state, f.by, f.target, now()), { undo: true });
    if (f.type === 'spy') {
      if (f.mine) return handleAct(hostPid, 'guess', { place: f.place });
      if (!state.secret.spies.includes(f.by)) {
        FX.play('nope');
        return toast(`🤨 ${state.players[f.by]?.name} n’est pas un espion !`, 3000);
      }
      commit(G.spyGuess(state, f.by, f.place), { undo: true });
    }
  },
};
// Sélection d'un lieu dans la fenêtre « l'espion se dévoile »
document.addEventListener('click', (e) => {
  const t = e.target.closest('#flowBody [data-place]');
  if (t) flowActs.fPlace(t);
});

function renderFlow() {
  const f = ui.flow;
  const R = state.round;
  const body = $('#flowBody');
  if (!f || !R) return;
  let html = '';
  if (f.type === 'acc' || f.type === 'myAcc') {
    if (f.step === 1) {
      html = `<h2>🫵 Accusation</h2><p class="muted">Qui accuse ? (une seule accusation par joueur et par manche)</p>
        ${UI.playerChips(state, R.ids, { act: 'fBy', dis: R.accusedBy })}`;
    } else {
      const by = state.players[f.by];
      html = `<h2>🫵 ${f.type === 'myAcc' ? 'J’accuse…' : `${esc(by?.name)} accuse…`}</h2><p class="muted">Qui est l’espion d’après ${f.type === 'myAcc' ? 'toi' : esc(by?.name)} ?</p>
        ${UI.playerChips(state, R.ids.filter((id) => id !== f.by), { act: 'fTarget', sel: f.target })}
        <p class="muted small">Le chrono s’arrête et tout le monde vote. ${state.settings.vote === 'majority' ? 'La majorité suffit.' : 'Il faut que tout le monde soit d’accord.'}</p>
        <div class="row">${f.type === 'acc' ? '<button class="btn ghost" data-act="fBack">← Retour</button>' : ''}<button class="btn ko" data-act="fOk" ${f.target ? '' : 'disabled'}>🫵 Accuser</button></div>`;
    }
  } else if (f.type === 'spy') {
    if (f.step === 1) {
      html = `<h2>🕵️ L’espion se dévoile</h2><p class="muted">L’espion annonce qu’il connaît le lieu. Qui est-ce ?</p>
        ${UI.playerChips(state, R.ids, { act: 'fBy' })}`;
    } else if (f.mine && !state.secret.spies.includes(hostPid)) {
      html = `<h2>🕵️ Je suis l’espion…</h2><p class="big-txt">Tu n’es pas l’espion 😉</p><p class="muted">Ce bouton est là pour tout le monde, pour que personne ne repère l’espion à son écran.</p>`;
    } else {
      const pl = f.place && placeById(f.place);
      html = `<h2>🕵️ ${f.mine ? 'Je sais où on est !' : `${esc(state.players[f.by]?.name)} pense que c’est…`}</h2>
        <p class="muted small">Attention : une seule tentative ! Si c’est faux, les autres gagnent.</p>
        <div class="pgrid">${UI.placesHtml(R.places, { mode: 'pick', sel: f.place })}</div>
        <div class="row sticky-ok">${f.mine ? '' : '<button class="btn ghost" data-act="fBack">← Retour</button>'}<button class="btn go" data-act="fOk" ${f.place ? '' : 'disabled'}>${pl ? `C’est ${esc(pl.name.toLowerCase())} !` : 'Choisis un lieu'}</button></div>`;
    }
  }
  body.innerHTML = html + '<button class="btn ghost" data-act="close">Annuler</button>';
}

// ---------- Joueurs enregistrés & groupes (repris de Buzzer) ----------
let rFilter = '';
let rGroupsOpen = false;
const cycle = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
function rosterChanged() {
  renderRoster();
  syncSinglePlayers();
  render(true);
  broadcastState();
}
function tryRoster(fn) {
  try {
    fn();
    rosterChanged();
  } catch (err) {
    toast(err.message);
  }
}
const rosterActs = {
  roster() {
    renderRoster();
    openModal('#rosterModal');
  },
  rFilter: (b) => {
    rFilter = b.dataset.g;
    renderRoster();
  },
  rGroups: () => {
    rGroupsOpen = !rGroupsOpen;
    renderRoster();
  },
  rAvatar: (b) => tryRoster(() => roster.update(b.dataset.id, { avatar: cycle(AVATARS, roster.players.find((p) => p.id === b.dataset.id)?.avatar) })),
  rColor: (b) => tryRoster(() => roster.update(b.dataset.id, { color: cycle(COLORS, roster.players.find((p) => p.id === b.dataset.id)?.color) })),
  rToggle: (b) => tryRoster(() => roster.toggleGroup(b.dataset.id, b.dataset.g)),
  rDel: (b) => {
    const p = roster.players.find((x) => x.id === b.dataset.id);
    if (p && confirm(`Supprimer ${p.name} de la liste des joueurs enregistrés ?`)) tryRoster(() => roster.remove(p.id));
  },
  rAdd: () => {
    const el = $('#rNew');
    const used = roster.players;
    tryRoster(() => {
      roster.add(el.value, {
        groupId: rFilter || state.settings.group,
        avatar: AVATARS.find((a) => !used.some((p) => p.avatar === a)),
        color: COLORS.find((c) => !used.some((p) => p.color === c)) || COLORS[used.length % COLORS.length],
      });
    });
    setTimeout(() => $('#rNew')?.focus(), 0);
  },
  rgIcon: (b) => tryRoster(() => roster.cycleGroupIcon(b.dataset.g)),
  rgAdd: () => tryRoster(() => roster.addGroup($('#gNew').value)),
  rgDel: (b) => {
    const g = roster.group(b.dataset.g);
    if (!g || !confirm(`Supprimer le groupe ${g.icon} ${g.name} ? Les joueurs ne sont pas supprimés : ils quittent seulement ce groupe.`)) return;
    tryRoster(() => {
      roster.removeGroup(g.id);
      if (rFilter === g.id) rFilter = '';
      if (state.settings.group === g.id) commit(G.setSettings(state, { group: '' }));
    });
  },
  rImport: () =>
    tryRoster(() => {
      const n = roster.importUndercover($('#impTxt').value);
      $('#impTxt').value = '';
      toast(n ? `✅ ${n} joueur${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''} d’Undercover` : '✅ Groupes mis à jour (aucun nouveau joueur)');
    }),
};

function renderRoster() {
  const body = $('#rosterBody');
  if (!body) return;
  const list = roster.inGroup(rFilter);
  const count = (gid) => roster.inGroup(gid).length;
  const chips = [['', '👥 Tous']]
    .concat(roster.groups.map((g) => [g.id, `${g.icon} ${esc(g.name)}`]))
    .map(([id, l]) => `<button class="chip ${rFilter === id ? 'on' : ''}" data-act="rFilter" data-g="${esc(id)}">${l} <small>${count(id)}</small></button>`)
    .join('');
  const groupsEditor = rGroupsOpen
    ? `<div class="gedit">${roster.groups
        .map(
          (g) => `<div class="grow-row"><button class="mini big-ico" data-act="rgIcon" data-g="${esc(g.id)}" aria-label="Changer l’icône">${g.icon}</button>
          <input class="gname" data-gid="${esc(g.id)}" value="${esc(g.name)}" maxlength="20" aria-label="Nom du groupe">
          <span class="muted small">${count(g.id)}</span><button class="mini kick" data-act="rgDel" data-g="${esc(g.id)}" aria-label="Supprimer le groupe">✕</button></div>`
        )
        .join('')}
        <div class="row add-row"><input id="gNew" placeholder="Nouveau groupe (ex. Foot, Voisins)" maxlength="20" enterkeyhint="done"><button class="btn go" data-act="rgAdd">＋</button></div></div>`
    : '';
  const rows = list
    .map(
      (p) => `<div class="rrow" style="--c:${esc(p.color)}">
      <button class="av" style="--c:${esc(p.color)}" data-act="rAvatar" data-id="${esc(p.id)}" aria-label="Changer l’animal">${esc(p.avatar)}</button>
      <input class="rname" data-rid="${esc(p.id)}" value="${esc(p.name)}" maxlength="16" aria-label="Prénom">
      <button class="dot" style="background:${esc(p.color)}" data-act="rColor" data-id="${esc(p.id)}" aria-label="Changer la couleur"></button>
      <button class="mini kick" data-act="rDel" data-id="${esc(p.id)}" aria-label="Supprimer">✕</button>
      <div class="gchips">${roster.groups.map((g) => `<button class="gchip ${p.groups.includes(g.id) ? 'on' : ''}" data-act="rToggle" data-id="${esc(p.id)}" data-g="${esc(g.id)}">${g.icon} ${esc(g.name)}</button>`).join('')}</div></div>`
    )
    .join('');
  body.innerHTML = `<h2>👥 Joueurs enregistrés</h2>
    <p class="muted small">Ils apparaissent dans « Qui joue ? » et dans le « Qui es-tu ? » des téléphones. Touche l’animal ou la pastille pour les changer, et les groupes pour y ranger un joueur.</p>
    <div class="chips">${chips}<button class="chip add" data-act="rGroups">⚙️ Groupes</button></div>
    ${groupsEditor}
    <div class="rlist">${rows || `<p class="muted center">${rFilter ? 'Personne dans ce groupe.' : 'Aucun joueur enregistré pour l’instant.'}</p>`}</div>
    <div class="row add-row"><input id="rNew" placeholder="Prénom du nouveau joueur" maxlength="16" enterkeyhint="done"><button class="btn go" data-act="rAdd">＋</button></div>
    <details class="imp"><summary>📥 Importer depuis Undercover</summary>
      <p class="muted small">Dans Undercover : Réglages → « Exporter mes données », puis copie le code (il commence par UCF2:) ou télécharge le fichier. Les joueurs et les groupes sont ajoutés, rien n’est effacé.</p>
      <textarea id="impTxt" rows="3" placeholder="Colle le code ici (UCF2:…)"></textarea>
      <div class="row"><button class="btn" data-act="rImport">Importer le code</button><label class="btn ghost">📂 Fichier .json<input type="file" id="impFile" accept=".json,.txt,application/json,text/plain" hidden></label></div>
    </details>
    <button class="btn" data-act="close">Fermer</button>`;
}
$('#rosterBody').addEventListener('change', (e) => {
  const t = e.target;
  if (t.classList.contains('rname')) {
    try {
      roster.update(t.dataset.rid, { name: t.value });
    } catch (err) {
      toast(err.message);
    }
    rosterChanged();
  } else if (t.classList.contains('gname')) {
    roster.renameGroup(t.dataset.gid, t.value);
    rosterChanged();
  } else if (t.id === 'impFile' && t.files[0]) {
    t.files[0].text().then((txt) => {
      $('#impTxt').value = txt;
      rosterActs.rImport();
    });
  }
});
$('#rosterBody').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'rNew') rosterActs.rAdd();
  else if (e.target.id === 'gNew') rosterActs.rgAdd();
  else if (e.target.matches('.rname, .gname')) e.target.blur();
});

function groupPickerHtml() {
  const cur = state.settings.group;
  const opts = [['', '👥 Tous', roster.players.length]].concat(roster.groups.map((g) => [g.id, `${g.icon} ${esc(g.name)}`, roster.inGroup(g.id).length]));
  return `<div class="gpick"><span class="muted small">Groupe qui joue</span><div class="chips">${opts
    .map(([id, l, n]) => `<button class="chip ${cur === id ? 'on' : ''}" data-act="group" data-g="${esc(id)}">${l} <small>${n}</small></button>`)
    .join('')}<button class="chip add" data-act="roster">✏️ Joueurs</button></div></div>`;
}

// ---------- Modales & réglages ----------
function openModal(sel) {
  $(sel).classList.add('open');
}
function closeModal() {
  document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
  ui.flow = null;
}
document.querySelectorAll('.modal').forEach((m) =>
  m.addEventListener('click', (e) => {
    if (e.target === m) closeModal();
  })
);

function syncSettingsForm() {
  const f = $('#setForm');
  const st = state.settings;
  f.phones.value = st.phones;
  f.minutes.value = String(st.minutes);
  f.spies.value = String(st.spies);
  f.vote.value = st.vote;
  f.roles.checked = !!st.roles;
  f.endMode.value = st.endMode;
  f.endRounds.value = String(st.endRounds);
  f.endScore.value = String(st.endScore);
  f.sound.checked = soundOn;
  $('#packBox').innerHTML = PACKS.map((p) => {
    const n = PLACES.filter((x) => x.pack === p.id).length;
    return `<label class="seg"><input type="checkbox" name="pack" value="${p.id}" ${st.packs.includes(p.id) ? 'checked' : ''}><span>${p.icon} ${esc(p.name)} <small>${n}</small></span></label>`;
  }).join('');
  const total = PLACES.filter((x) => st.packs.includes(x.pack)).length;
  $('#packCount').textContent = `${total} lieux possibles : c’est la liste que l’espion aura sous les yeux.`;
  $('#tvLink').href = link('tv.html', { r: room });
  $('#tvUrl').textContent = tvUrl;
}
$('#setForm').addEventListener('change', (e) => {
  const f = e.currentTarget;
  const n = e.target.name;
  if (n === 'sound') {
    soundOn = f.sound.checked;
    store.set('lieu-host-sound', soundOn);
    FX.setMuted(!soundOn);
    return;
  }
  if (n === 'phones') return setMode(f.phones.value);
  let packs = [...f.querySelectorAll('input[name=pack]:checked')].map((x) => x.value);
  if (!packs.length) {
    toast('Garde au moins un paquet de lieux');
    packs = state.settings.packs;
  }
  const patch = {
    minutes: Number(f.minutes.value),
    spies: f.spies.value === 'auto' ? 'auto' : Number(f.spies.value),
    vote: f.vote.value,
    roles: f.roles.checked,
    packs,
    endMode: f.endMode.value,
    endRounds: Number(f.endRounds.value),
    endScore: Number(f.endScore.value),
  };
  saveSettings(patch);
  commit(G.setSettings(state, patch));
  syncSettingsForm();
  if (state.round && state.round.phase !== 'reveal' && ['minutes', 'spies', 'roles', 'pack'].includes(n)) toast('Ce réglage comptera à partir de la prochaine manche');
});

// ---------- Rendu ----------
const P = (id) => state.players[id] || UI.GONE;
const clockHtml = (cls = '') => `<div class="bigclock ${cls}" data-clock>${UI.clockText(G.remaining(state.round, now()))}</div>`;

function myCardBlock(compact) {
  const card = G.cardFor(state, hostPid);
  if (!card) return '<p class="muted">Tu joueras à la prochaine manche 🙂</p>';
  return UI.holdCardHtml(card, { compact, hint: compact ? 'Garde ton doigt ici pour revoir ta carte' : undefined });
}

function lobbyHtml() {
  const modeSeg = `<div class="modeseg"><button class="${single() ? '' : 'on'}" data-act="mode" data-v="multi">📱📱 Un téléphone par joueur</button><button class="${single() ? 'on' : ''}" data-act="mode" data-v="single">📱 Un seul téléphone</button></div>`;
  if (single()) {
    const sel = new Set(store.get('lieu-selection', []));
    const list = roster.inGroup(state.settings.group);
    const n = state.order.length;
    return `${modeSeg}
      <h2 class="stitle">Qui joue ?</h2>
      ${groupPickerHtml()}
      <div class="pchips">${list
        .map((p) => `<button class="who-chip ${sel.has(p.id) ? 'on' : ''}" data-act="sel" data-id="${esc(p.id)}" style="--c:${esc(p.color)}">${UI.avatarBubble(p)}${esc(p.name)}</button>`)
        .join('') || '<p class="muted">Aucun joueur enregistré dans ce groupe : ajoute-les ci-dessous.</p>'}</div>
      <div class="row add-row"><input id="quickAdd" placeholder="Ajouter un joueur" maxlength="16" enterkeyhint="done"><button class="btn go" id="quickAddBtn">＋</button></div>
      <p class="muted">${n} joueur${n > 1 ? 's' : ''} ${n < G.MIN_PLAYERS ? `· il en faut au moins ${G.MIN_PLAYERS}` : ''}</p>
      <button class="btn huge go" data-act="start" ${n >= G.MIN_PLAYERS ? '' : 'disabled'}>🃏 Distribuer les cartes</button>
      <p class="muted small">📺 Envie d’un écran TV ? Ouvre <b>tv.html</b> sur la télé avec le code <b class="code">${room}</b> (lien dans ⚙️).</p>`;
  }
  const ids = roundIds();
  const n = ids.length;
  const myRid = state.players[hostPid]?.rid || '';
  const taken = (p) => Object.values(state.players).some((x) => x.id !== hostPid && sameName(x.name, p.name));
  const hostChips = roster
    .inGroup(state.settings.group)
    .map((p) => `<button class="who-chip ${myRid === p.id ? 'on' : ''}" data-act="hostPlay" data-id="${esc(p.id)}" style="--c:${esc(p.color)}" ${taken(p) ? 'disabled' : ''}>${UI.avatarBubble(p)}${esc(p.name)}</button>`)
    .join('');
  const crowd = state.order
    .map((id) => {
      const p = P(id);
      const off = id !== hostPid && !online.has(id);
      return `<span class="crowd-p ${off ? 'off' : ''}" style="--c:${esc(p.color)}">${UI.avatarBubble(p)}<small>${esc(p.name)}${id === hostPid ? ' 🎩' : ''}</small></span>`;
    })
    .join('');
  return `${modeSeg}
    <div class="lobby">
      <div class="qrbox small" data-act="qr">${qrSvg(joinUrl)}</div>
      <div><p class="big-txt">Code <b class="code">${room}</b></p>
      <p class="muted">Les joueurs scannent le QR code (ou tapent le code sur la page d’accueil).</p></div></div>
    ${groupPickerHtml()}
    <div class="gpick"><span class="muted small">🙋 Tu joues aussi ?</span><div class="pchips">${hostChips}
      <button class="who-chip ${myRid ? '' : 'on'}" data-act="hostPlay" data-id="">🎩 Non, je fais l’arbitre</button></div></div>
    <div class="crowd-row">${crowd || '<span class="muted">En attente des joueurs…</span>'}</div>
    <p class="muted">${n} joueur${n > 1 ? 's' : ''} prêt${n > 1 ? 's' : ''} ${n < G.MIN_PLAYERS ? `· il en faut au moins ${G.MIN_PLAYERS}` : ''}</p>
    <button class="btn huge go" data-act="start" ${n >= G.MIN_PLAYERS ? '' : 'disabled'}>🃏 Distribuer les cartes</button>`;
}

function dealHtml() {
  const R = state.round;
  const head = `<p class="phase">Manche ${R.n}</p>`;
  if (single()) {
    const id = R.ids[R.deal];
    const p = P(id);
    if (!ui.peek) {
      return `${head}<p class="big-txt">📱 Passe le téléphone à</p>
        <div class="who-big" style="--c:${esc(p.color)}">${UI.avatarBubble(p, 'xl')}<div class="who-name">${esc(p.name)}</div></div>
        <p class="muted">Joueur ${R.deal + 1} sur ${R.ids.length}. Les autres, on ne regarde pas 🙈</p>
        <button class="btn huge go" data-act="peek">C’est moi, ${esc(p.name)} 👋</button>
        <button class="btn ghost" data-act="redeal">🔄 Changer de lieu</button>`;
    }
    const last = R.deal + 1 >= R.ids.length;
    return `${head}<p class="big-txt">${UI.avatarBubble(p)} ${esc(p.name)}, voici ta carte</p>
      ${UI.holdCardHtml(G.cardFor(state, id))}
      <button class="btn huge go" data-act="dealNext" id="dealNextBtn" ${ui.peekSeen ? '' : 'disabled'}>${last ? 'J’ai retenu ✓ Lancer le chrono' : 'J’ai retenu ✓ Au suivant'}</button>`;
  }
  const rows = R.ids
    .map((id) => `<span class="crowd-p ${R.seen.includes(id) ? '' : 'off'}" style="--c:${esc(P(id).color)}">${UI.avatarBubble(P(id))}<small>${R.seen.includes(id) ? '✅' : '⏳'} ${esc(P(id).name)}</small></span>`)
    .join('');
  const mine = hostPlays() && R.ids.includes(hostPid)
    ? `<div class="mycard">${myCardBlock(false)}<button class="btn go big" data-act="mySeen" id="mySeenBtn" ${ui.mySeen && !R.seen.includes(hostPid) ? '' : 'disabled'}>${R.seen.includes(hostPid) ? '✅ Carte vue' : 'J’ai vu ma carte ✓'}</button></div>`
    : '';
  return `${head}<p class="big-txt">🃏 Chacun découvre sa carte en secret</p>
    <div class="crowd-row">${rows}</div>
    <p class="muted">${R.seen.length} / ${R.ids.length} prêts. Le chrono démarre quand tout le monde a vu sa carte.</p>
    ${mine}
    <div class="row"><button class="btn ghost" data-act="forceStart">⏩ Lancer le chrono</button><button class="btn ghost" data-act="redeal">🔄 Changer de lieu</button></div>`;
}

function ideaHtml() {
  return `<div class="idea"><button class="btn ghost" data-act="idea">💡 Une idée de question</button>${ui.idea ? `<p class="idea-q">« ${esc(ui.idea)} »</p>` : ''}</div>`;
}

function playHtml() {
  const R = state.round;
  const { asker, forbidden } = G.askerInfo(R);
  let turn = '';
  if (single()) turn = `<p class="turn-line">🎤 <b>${esc(P(R.first).name)}</b> pose la première question à qui il veut. Celui qui répond pose la suivante (mais pas à celui qui vient de l’interroger).</p>`;
  else {
    turn = `<p class="turn-line">${UI.turnHtml(state)}</p>`;
    if (hostPlays() && asker === hostPid)
      turn += `<div class="myturn"><p class="big-txt">🎤 À toi ! Qui interroges-tu ?</p>${UI.playerChips(state, R.ids.filter((id) => id !== hostPid), { act: 'myAsk', dis: forbidden ? [forbidden] : [] })}</div>`;
  }
  const mine = hostPlays() && R.ids.includes(hostPid);
  const btns = single()
    ? `<div class="row"><button class="btn ko" data-act="accStart">🫵 Accusation</button><button class="btn" data-act="spyStart">🕵️ L’espion se dévoile</button></div>`
    : mine
      ? `<div class="row"><button class="btn ko" data-act="myAccuse" ${R.accusedBy.includes(hostPid) ? 'disabled' : ''}>🫵 J’accuse…</button><button class="btn" data-act="mySpy">🕵️ Je suis l’espion…</button></div>`
      : '';
  return `<p class="phase">Manche ${R.n}${R.paused ? ' · ⏸ pause' : ''}</p>
    ${clockHtml(R.paused ? 'paused' : '')}
    ${turn}
    ${mine ? myCardBlock(true) : ''}
    ${btns}
    ${ideaHtml()}
    <details class="plist" ${single() || mine ? 'open' : ''}><summary>🗺️ Les lieux possibles (${R.places.length})</summary><div class="pgrid">${UI.placesHtml(R.places, { crossed: mine ? ui.crossed : null, mode: mine ? 'cross' : '' })}</div>${mine ? '<p class="muted small">Touche un lieu pour le barrer.</p>' : ''}</details>
    <div class="row"><button class="btn ghost" data-act="pause">${R.paused ? '▶ Reprendre' : '⏸ Pause'}</button><button class="btn ghost" data-act="timeup">⏩ Fin du temps</button></div>
    <button class="btn ghost" data-act="redeal">🔄 Changer de lieu</button>`;
}

function accuseHtml() {
  const R = state.round;
  const a = R.acc;
  const maj = state.settings.vote === 'majority';
  if (single()) {
    return `<p class="phase">Manche ${R.n} · chrono arrêté ${UI.clockText(R.left)}</p>
      <div class="accuse-head">${UI.avatarBubble(P(a.by), 'lg')}<span class="bang">🫵</span>${UI.avatarBubble(P(a.target), 'xl')}</div>
      <p class="big-txt">${esc(P(a.by).name)} accuse ${esc(P(a.target).name)} !</p>
      <p>Votez à main levée. ${esc(P(a.target).name)} ne vote pas. ${maj ? 'La majorité suffit.' : 'Il faut que tout le monde soit d’accord.'}</p>
      <div class="judge"><button class="btn huge ok" data-act="accYes">✅ ${maj ? 'Majorité d’accord' : 'Tous d’accord'}</button><button class="btn huge ko" data-act="accNo">❌ ${maj ? 'Pas de majorité' : 'Pas d’accord'}</button></div>`;
  }
  const canVote = hostPlays() && R.ids.includes(hostPid) && hostPid !== a.target && hostPid !== a.by;
  const myV = a.votes[hostPid];
  return `<p class="phase">Manche ${R.n} · chrono arrêté ${UI.clockText(R.left)}</p>
    ${UI.accusationHtml(state, present())}
    ${canVote ? `<p class="big-txt">${esc(P(a.target).name)} est l’espion ?</p><div class="judge"><button class="btn huge ok ${myV === true ? 'picked' : ''}" data-act="myYes">👍 Oui</button><button class="btn huge ko ${myV === false ? 'picked' : ''}" data-act="myNo">👎 Non</button></div>` : ''}
    ${G.accusationComplete(R, present()) ? '<p class="big-txt">🥁 Dépouillement…</p>' : '<button class="btn ghost" data-act="closeAcc">⏹ Clôturer le vote</button><p class="muted small">Un joueur connecté qui n’a pas voté compte comme « non ».</p>'}`;
}

function finalHtml() {
  const R = state.round;
  const maj = state.settings.vote === 'majority';
  if (single()) {
    return `<p class="phase">Manche ${R.n}</p><div class="tv-big pulse">⏰</div>
      <p class="big-txt">Temps écoulé ! 3, 2, 1… montrez tous l’espion du doigt !</p>
      <p class="muted">Qui a été désigné ? ${maj ? 'Il faut la majorité.' : 'Il faut que tout le monde (sauf lui) soit d’accord.'}</p>
      ${UI.playerChips(state, R.ids, { act: 'finalPick' })}
      <button class="btn ghost" data-act="finalNone">🤷 Pas d’accord, ou égalité</button>
      <button class="btn" data-act="spyStart">🕵️ L’espion se dévoile</button>`;
  }
  const voted = R.fvoted || Object.keys(R.fvotes);
  const rows = R.ids
    .map((id) => `<span class="crowd-p ${voted.includes(id) ? '' : 'off'}" style="--c:${esc(P(id).color)}">${UI.avatarBubble(P(id))}<small>${voted.includes(id) ? '🗳️' : '⏳'} ${esc(P(id).name)}</small></span>`)
    .join('');
  const mine = hostPlays() && R.ids.includes(hostPid);
  return `<p class="phase">Manche ${R.n}</p><div class="tv-big pulse">⏰</div>
    <p class="big-txt">Temps écoulé ! Chacun désigne l’espion sur son téléphone.</p>
    <div class="crowd-row">${rows}</div>
    ${mine ? `<p class="muted">Ton vote :</p>${UI.playerChips(state, R.ids.filter((id) => id !== hostPid), { act: 'myVote', sel: R.fvotes[hostPid] || null })}<button class="btn" data-act="mySpy">🕵️ Je suis l’espion…</button>` : ''}
    <button class="btn ghost" data-act="closeFinal">📊 Dépouiller maintenant</button>`;
}

function revealHtml() {
  const over = G.gameOver(state);
  return `${UI.resultHtml(state)}
    ${over ? '<button class="btn huge go" data-act="podium">🏁 Voir le podium</button>' : `<button class="btn huge go" data-act="next">▶ Manche suivante</button>`}
    <p class="muted small">${endInfo()}</p>`;
}

function endInfo() {
  const st = state.settings;
  const n = state.rounds.length;
  if (st.endMode === 'rounds') return `Manche ${n} sur ${st.endRounds}`;
  if (st.endMode === 'score') return `Premier à ${st.endScore} points`;
  return `${n} manche${n > 1 ? 's' : ''} jouée${n > 1 ? 's' : ''}`;
}

function stageHtml() {
  if (state.podium) {
    return `${UI.podiumHtml(state)}<div class="row"><button class="btn big" data-act="unpodium">↩️ Revenir au jeu</button><button class="btn ghost" data-act="reset">🔄 Nouvelle partie</button></div>`;
  }
  const R = state.round;
  if (!R) return lobbyHtml();
  switch (R.phase) {
    case 'deal':
      return dealHtml();
    case 'play':
      return playHtml();
    case 'accuse':
      return accuseHtml();
    case 'final':
      return finalHtml();
    case 'reveal':
      return revealHtml();
  }
  return '';
}

let lastStageKey = '';
function render(force = false) {
  const R = state.round;
  // On ne reconstruit la zone principale que si elle change (évite de « manger » un appui).
  const key = JSON.stringify([
    state.v,
    state.podium,
    single(),
    online.size,
    [...online],
    ui.peek,
    ui.idea,
    roster.players.length,
    state.settings.group,
    R && R.phase === 'play' ? null : 0,
  ]);
  if (force || key !== lastStageKey) {
    const st = $('#stage');
    const open = st.querySelector('details.plist')?.open;
    st.innerHTML = stageHtml();
    const d = st.querySelector('details.plist');
    if (d && open != null) d.open = open;
    st.dataset.phase = state.podium ? 'podium' : R ? R.phase : 'lobby';
    lastStageKey = key;
  }
  $('#roomCode').textContent = room;
  $('#roomCode2').textContent = room;
  $('#online').textContent = single() ? '📱 un téléphone' : `${online.size} connecté${online.size > 1 ? 's' : ''}`;
  const last = R && R.phase === 'reveal' ? R.result.points : null;
  $('#boardCard').hidden = !state.rounds.length;
  UI.flipRender($('#board'), UI.boardHtml(state, { online: single() ? null : new Set([...online, hostPid]), host: ui.fixing, last }));
  $('#board').classList.toggle('fixing', ui.fixing);
  $('#fixBtn').textContent = ui.fixing ? '✅ Terminé' : '✏️ Corriger';
  $('#fixHint').hidden = !ui.fixing;
  $('#undoBtn').disabled = !undoStack.length;
  $('#endBtn').disabled = !state.rounds.length || state.podium;
  if (ui.flow) renderFlow();
}

// Cartes à retourner : on active « J'ai retenu » au premier retournement
UI.bindHold($('#stage'), () => {
  const R = state.round;
  if (!R || R.phase !== 'deal') return;
  if (single()) {
    ui.peekSeen = true;
    const b = $('#dealNextBtn');
    if (b) b.disabled = false;
  } else {
    ui.mySeen = true;
    const b = $('#mySeenBtn');
    if (b && !R.seen.includes(hostPid)) b.disabled = false;
  }
});

// Chrono : affichage et fin du temps
let lastSec = null;
setInterval(() => {
  const R = state.round;
  if (!R) return;
  const left = G.remaining(R, now());
  document.querySelectorAll('[data-clock]').forEach((el) => {
    el.textContent = UI.clockText(left);
    el.classList.toggle('hurry', R.phase === 'play' && !R.paused && left < 30000);
  });
  if (R.phase === 'play' && !R.paused) {
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec && sec <= 10 && sec > 0) FX.play('tick');
    lastSec = sec;
    if (R.endsAt != null && R.endsAt <= now()) commit(G.timeUp(state, now()));
  }
}, 250);

// ---------- Démarrage ----------
if (!single() && !state.round && !state.rounds.length) {
  const rid = store.get('lieu-host-play', '');
  const r = rid && roster.players.find((p) => p.id === rid);
  if (r && !state.players[hostPid]) state = G.upsertPlayer(state, { id: hostPid, name: r.name, avatar: r.avatar, color: r.color, rid: r.id }, { rejoin: true }) || state;
}
if (single() && !state.round) state = G.setPlayers(state, selection());
store.set(SAVE_KEY, state);
$('#qrBig').innerHTML = qrSvg(joinUrl);
$('#joinUrl').textContent = joinUrl.replace(/^https?:\/\//, '');
render(true);
keepAwake();
makeKeys().then((k) => {
  keys = k;
  sendAllCards();
});

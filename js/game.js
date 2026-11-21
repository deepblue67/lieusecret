// Règles du Lieu secret. Module pur (aucun accès au DOM ni au réseau) : le maître
// du jeu est le seul à appliquer ces fonctions, puis il diffuse l'état PUBLIC
// (sans le lieu ni les espions) à tout le monde. Chaque joueur reçoit sa carte à part.
// Chaque fonction reçoit un état et renvoie un NOUVEL état (l'original n'est pas modifié).
// Une action refusée renvoie null.

import { DEFAULT_PACKS, placeById, placesForPacks } from './places.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

export const DEFAULT_SETTINGS = {
  phones: 'multi', // 'single' (un téléphone qui passe de main en main) | 'multi' (un par joueur)
  minutes: 8, // durée d'une manche
  spies: 'auto', // 'auto' | 1 | 2
  roles: false, // un rôle pour chaque joueur qui connaît le lieu
  vote: 'unanimous', // 'unanimous' | 'majority'
  packs: DEFAULT_PACKS,
  endMode: 'rounds', // 'rounds' | 'score' | 'free'
  endRounds: 5,
  endScore: 10,
  group: '', // groupe de joueurs enregistrés qui joue ('' = tout le monde)
};

export const POINTS = {
  spyTimeout: 2, // l'espion n'a pas été démasqué à la fin du chrono
  spyFramed: 4, // un innocent a été accusé à tort
  spyGuess: 4, // l'espion a deviné le lieu
  spyMate: 2, // l'autre espion, quand son partenaire devine le lieu
  caught: 1, // chaque innocent, quand un espion est démasqué ou se trompe de lieu
  accuserBonus: 1, // en plus, pour celui qui a lancé la bonne accusation
};

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export function randomId(len = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const freshStats = () => ({ score: 0, spy: 0, spyWins: 0, caught: 0, guessed: 0 });

export function newGame(room, settings = {}) {
  return {
    gid: randomId(8),
    v: 0,
    room,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    players: {}, // id -> { id, name, avatar, color, rid, score, spy, spyWins, caught, guessed }
    order: [], // ordre d'arrivée (ou de sélection en mode un téléphone)
    kicked: [],
    round: null,
    rounds: [], // résumé des manches jouées
    used: [], // lieux joués récemment (évite les répétitions)
    podium: false,
    secret: null, // { place, spies, roles } : JAMAIS diffusé (voir publicState)
  };
}

// ---------- Joueurs ----------

function playerFields(p) {
  return {
    name: String(p.name || 'Joueur').trim().slice(0, 16),
    avatar: String(p.avatar || p.emoji || '🙂').slice(0, 8),
    color: String(p.color || '#ff4d6d').slice(0, 16),
    rid: p.rid ? String(p.rid).slice(0, 40) : null,
  };
}

export function upsertPlayer(state, profile, { rejoin = false } = {}) {
  const { id } = profile;
  if (!id) return null;
  if (state.kicked.includes(id) && !rejoin) return null;
  const s = clone(state);
  s.kicked = s.kicked.filter((k) => k !== id);
  if (s.players[id]) Object.assign(s.players[id], playerFields(profile));
  else {
    if (Object.keys(s.players).length >= MAX_PLAYERS) return null;
    s.players[id] = { id, ...playerFields(profile), ...freshStats() };
    s.order.push(id);
  }
  return s;
}

/** Mode un téléphone : la liste des joueurs est choisie par le maître du jeu (les scores sont gardés). */
export function setPlayers(state, list) {
  const s = clone(state);
  const next = {};
  for (const p of list.slice(0, MAX_PLAYERS)) {
    const old = s.players[p.id];
    next[p.id] = old ? { ...old, ...playerFields(p) } : { id: p.id, ...playerFields(p), ...freshStats() };
  }
  s.players = next;
  s.order = list.map((p) => p.id).filter((id) => next[id]);
  return s;
}

/** Un joueur reprend sa place depuis un autre téléphone (même prénom) : tout le suit. */
export function movePlayer(state, oldId, newId) {
  if (!state.players[oldId] || oldId === newId) return state;
  let s = clone(state);
  if (s.players[newId]) {
    // ce téléphone jouait sous un autre prénom : on garde ce joueur à part
    const keep = randomId(12);
    s = renameIds(s, newId, keep);
  }
  return renameIds(s, oldId, newId);
}

function renameIds(s, from, to) {
  const r = (id) => (id === from ? to : id);
  if (s.players[from]) {
    s.players[to] = { ...s.players[from], id: to };
    delete s.players[from];
  }
  s.order = s.order.map(r);
  s.kicked = s.kicked.filter((id) => id !== from);
  const rk = (o) => {
    if (!o || !(from in o)) return o;
    o[to] = o[from];
    delete o[from];
    return o;
  };
  const R = s.round;
  if (R) {
    R.ids = R.ids.map(r);
    R.seen = R.seen.map(r);
    R.first = r(R.first);
    R.accusedBy = R.accusedBy.map(r);
    if (R.turn) R.turn = { from: r(R.turn.from), to: r(R.turn.to) };
    if (R.acc) {
      R.acc.by = r(R.acc.by);
      R.acc.target = r(R.acc.target);
      rk(R.acc.votes);
    }
    rk(R.fvotes);
    for (const k of Object.keys(R.fvotes)) R.fvotes[k] = r(R.fvotes[k]);
    if (R.result) {
      R.result.spies = R.result.spies.map(r);
      rk(R.result.roles);
      rk(R.result.points);
      R.result.by = r(R.result.by);
      R.result.target = r(R.result.target);
    }
  }
  if (s.secret) {
    s.secret.spies = s.secret.spies.map(r);
    rk(s.secret.roles);
  }
  return s;
}

export function kick(state, id) {
  const s = clone(state);
  delete s.players[id];
  s.order = s.order.filter((x) => x !== id);
  if (!s.kicked.includes(id)) s.kicked.push(id);
  const R = s.round;
  if (R && R.phase !== 'reveal') {
    R.ids = R.ids.filter((x) => x !== id);
    R.seen = R.seen.filter((x) => x !== id);
    if (R.acc) delete R.acc.votes[id];
    delete R.fvotes[id];
  }
  return s;
}

export function adjustScore(state, id, delta) {
  if (!state.players[id]) return state;
  const s = clone(state);
  s.players[id].score += delta;
  return s;
}

export function setSettings(state, patch) {
  const s = clone(state);
  s.settings = { ...s.settings, ...patch };
  return s;
}

export function setPodium(state, on) {
  const s = clone(state);
  s.podium = !!on;
  return s;
}

/** Nouvelle partie : scores à zéro, les joueurs restent. */
export function resetScores(state) {
  const s = clone(state);
  for (const p of Object.values(s.players)) Object.assign(p, freshStats());
  s.round = null;
  s.rounds = [];
  s.secret = null;
  s.podium = false;
  s.gid = randomId(8);
  return s;
}

// ---------- Préparation d'une manche ----------

/** Nombre d'espions effectif (et s'il a fallu le réduire faute de joueurs). */
export function spyCount(settings, n) {
  const want = settings.spies === 'auto' ? (n >= 7 ? 2 : 1) : Number(settings.spies) === 2 ? 2 : 1;
  const got = want === 2 && n < 5 ? 1 : want;
  return { count: got, reduced: got < want };
}

function pickPlace(state, rng) {
  const list = placesForPacks(state.settings.packs);
  const recent = new Set(state.used.slice(-Math.floor(list.length / 2)));
  const fresh = list.filter((p) => !recent.has(p.id));
  const pool = fresh.length ? fresh : list;
  return { place: pool[Math.floor(rng() * pool.length)], list };
}

/**
 * Distribue une nouvelle manche entre les joueurs `ids` (connectés, ou tous en mode
 * un téléphone). `keepN` : on redistribue la même manche (« Changer de lieu »).
 */
export function startRound(state, ids, now, { rng = Math.random, keepN = false } = {}) {
  ids = ids.filter((id) => state.players[id]);
  if (ids.length < MIN_PLAYERS) return null;
  const s = clone(state);
  const { place, list } = pickPlace(s, rng);
  const { count } = spyCount(s.settings, ids.length);
  const spies = shuffle(ids, rng).slice(0, count);
  const roles = {};
  if (s.settings.roles) {
    const pool = shuffle(place.roles, rng);
    ids.filter((id) => !spies.includes(id)).forEach((id, i) => (roles[id] = pool[i % pool.length]));
  }
  s.secret = { place: place.id, spies, roles };
  const dur = Math.max(1, Number(s.settings.minutes) || 8) * 60000;
  const prev = s.round;
  s.round = {
    n: keepN && prev ? prev.n : s.rounds.length + 1,
    rid: randomId(6), // change à chaque distribution : les téléphones savent qu'il faut une nouvelle carte
    phase: 'deal',
    ids: s.order.filter((id) => ids.includes(id)),
    places: list.map((p) => p.id),
    spyCount: count,
    seen: [], // ont regardé leur carte
    deal: 0, // mode un téléphone : à qui le tour de regarder sa carte
    first: ids[Math.floor(rng() * ids.length)], // premier à poser une question
    dur,
    left: dur,
    endsAt: null,
    paused: false,
    turn: null,
    questions: 0,
    accusedBy: [], // une seule accusation par joueur et par manche
    acc: null, // accusation en cours : { by, target, votes: { id: true|false } }
    fvotes: {}, // vote final (fin du chrono) : votant -> suspect
    result: null,
    startedAt: now,
  };
  s.round.turn = { from: s.round.first, to: null };
  s.podium = false;
  return s;
}

/** Carte privée d'un joueur pour la manche en cours (null s'il ne joue pas cette manche). */
export function cardFor(state, id) {
  const R = state.round;
  if (!R || !state.secret || !R.ids.includes(id)) return null;
  const spy = state.secret.spies.includes(id);
  const card = { n: R.n, rid: R.rid, spy };
  if (spy) {
    card.mates = R.spyCount; // nombre d'espions (on ne dit pas qui)
  } else {
    const p = placeById(state.secret.place);
    card.place = { id: p.id, name: p.name, emoji: p.emoji };
    if (state.secret.roles[id]) card.role = state.secret.roles[id];
  }
  return card;
}

/**
 * État diffusé à tous les écrans : sans le lieu ni les espions (sauf une fois la
 * manche révélée) et sans le détail du vote final avant la révélation.
 */
export function publicState(state) {
  const { secret, ...rest } = state;
  const s = clone(rest);
  if (s.round && s.round.phase !== 'reveal') {
    s.round.fvoted = Object.keys(s.round.fvotes);
    s.round.fvotes = {};
  }
  return s;
}

// ---------- Déroulé ----------

export function remaining(R, now) {
  if (!R) return 0;
  return R.endsAt != null ? Math.max(0, R.endsAt - now) : R.left;
}

function startClock(s, now) {
  const R = s.round;
  R.phase = 'play';
  R.paused = false;
  R.endsAt = now + R.left;
}

/** Un téléphone par joueur : le joueur a regardé sa carte. Tout le monde l'a vue → chrono. */
export function markSeen(state, id, now) {
  const R = state.round;
  if (!R || R.phase !== 'deal' || !R.ids.includes(id) || R.seen.includes(id)) return null;
  const s = clone(state);
  s.round.seen.push(id);
  if (s.round.ids.every((x) => s.round.seen.includes(x))) startClock(s, now);
  return s;
}

/** Un seul téléphone : joueur suivant (après le dernier, le chrono démarre). */
export function dealNext(state, now) {
  const R = state.round;
  if (!R || R.phase !== 'deal') return null;
  const s = clone(state);
  const id = s.round.ids[s.round.deal];
  if (id && !s.round.seen.includes(id)) s.round.seen.push(id);
  s.round.deal += 1;
  if (s.round.deal >= s.round.ids.length) startClock(s, now);
  return s;
}

/** Le maître du jeu lance le chrono sans attendre tout le monde. */
export function forceStart(state, now) {
  if (!state.round || state.round.phase !== 'deal') return null;
  const s = clone(state);
  startClock(s, now);
  return s;
}

export function togglePause(state, now) {
  const R = state.round;
  if (!R || R.phase !== 'play') return null;
  const s = clone(state);
  const r = s.round;
  if (r.paused) {
    r.paused = false;
    r.endsAt = now + r.left;
  } else {
    r.left = remaining(r, now);
    r.endsAt = null;
    r.paused = true;
  }
  return s;
}

/** Fin du chrono : vote final. */
export function timeUp(state, now) {
  const R = state.round;
  if (!R || R.phase !== 'play' || R.endsAt == null || R.endsAt > now) return null;
  const s = clone(state);
  Object.assign(s.round, { phase: 'final', endsAt: null, left: 0, fvotes: {} });
  return s;
}

/** Qui doit poser la prochaine question, et à qui il n'a pas le droit de la poser. */
export function askerInfo(R) {
  if (!R || !R.turn) return { asker: null, forbidden: null };
  return R.turn.to ? { asker: R.turn.to, forbidden: R.turn.from } : { asker: R.turn.from, forbidden: null };
}

/** Le joueur qui a la parole interroge `target` (force : le maître du jeu corrige). */
export function ask(state, by, target, { force = false } = {}) {
  const R = state.round;
  if (!R || R.phase !== 'play') return null;
  const { asker, forbidden } = askerInfo(R);
  const from = force ? by || asker : by;
  if (!force && by !== asker) return null;
  if (!R.ids.includes(from) || !R.ids.includes(target) || target === from) return null;
  if (!force && target === forbidden) return null;
  const s = clone(state);
  s.round.turn = { from, to: target };
  s.round.questions += 1;
  return s;
}

/** « J'accuse… » : le chrono s'arrête, tout le monde vote. */
export function accuse(state, by, target, now) {
  const R = state.round;
  if (!R || R.phase !== 'play') return null;
  if (!R.ids.includes(by) || !R.ids.includes(target) || by === target || R.accusedBy.includes(by)) return null;
  const s = clone(state);
  const r = s.round;
  r.left = remaining(r, now);
  r.endsAt = null;
  r.phase = 'accuse';
  r.accusedBy.push(by);
  r.acc = { by, target, votes: { [by]: true } };
  return s;
}

export function vote(state, voter, yes) {
  const R = state.round;
  if (!R || R.phase !== 'accuse' || !R.acc) return null;
  if (!R.ids.includes(voter) || voter === R.acc.target) return null;
  if (voter === R.acc.by) return null; // l'accusateur vote oui d'office
  const s = clone(state);
  s.round.acc.votes[voter] = !!yes;
  return s;
}

/** Votants attendus pour l'accusation en cours (tous sauf l'accusé), parmi `present`. */
export function accVoters(R, present = null) {
  if (!R || !R.acc) return [];
  return R.ids.filter((id) => id !== R.acc.target && (!present || present.includes(id) || id === R.acc.by));
}

function verdict(settings, yes, total) {
  if (total <= 0) return false;
  return settings.vote === 'majority' ? yes > total / 2 : yes === total;
}

/**
 * Clôture de l'accusation. `present` : joueurs connectés (un vote manquant d'un joueur
 * connecté compte comme « non »). `decided` (mode un téléphone) : true/false décidé à main levée.
 */
export function closeAccusation(state, now, { present = null, decided = null } = {}) {
  const R = state.round;
  if (!R || R.phase !== 'accuse' || !R.acc) return null;
  let convicted;
  if (decided != null) convicted = !!decided;
  else {
    const voters = accVoters(R, present);
    const yes = voters.filter((v) => R.acc.votes[v] === true).length;
    convicted = verdict(state.settings, yes, voters.length);
  }
  if (convicted) {
    const isSpy = state.secret.spies.includes(R.acc.target);
    return resolve(state, isSpy ? 'caught' : 'framed', { by: R.acc.by, target: R.acc.target });
  }
  const s = clone(state);
  const r = s.round;
  r.acc = null;
  r.phase = 'play';
  r.paused = false;
  r.endsAt = now + r.left;
  return s;
}

/** Tout le monde a voté (parmi les joueurs connectés) ? */
export function accusationComplete(R, present = null) {
  if (!R || !R.acc) return false;
  return accVoters(R, present).every((v) => v in R.acc.votes);
}

/** Vote final, à la fin du chrono : chacun désigne un suspect. */
export function finalVote(state, voter, target) {
  const R = state.round;
  if (!R || R.phase !== 'final') return null;
  if (!R.ids.includes(voter) || !R.ids.includes(target) || voter === target) return null;
  const s = clone(state);
  s.round.fvotes[voter] = target;
  return s;
}

export function finalComplete(R, present = null) {
  if (!R || R.phase !== 'final') return false;
  return R.ids.filter((id) => !present || present.includes(id)).every((v) => v in R.fvotes);
}

/** Dépouillement du vote final : le plus désigné (sans égalité) doit avoir assez de voix. */
export function tallyFinal(state, present = null) {
  const R = state.round;
  const voters = R.ids.filter((id) => !present || present.includes(id) || id in R.fvotes);
  const counts = {};
  for (const v of voters) if (R.fvotes[v]) counts[R.fvotes[v]] = (counts[R.fvotes[v]] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) return { target: null, counts };
  const [target, yes] = sorted[0];
  const eligible = voters.filter((v) => v !== target).length;
  return { target: verdict(state.settings, yes, eligible) ? target : null, counts };
}

/** Clôture du vote final. `decided` (mode un téléphone) : id du joueur désigné, ou '' si personne. */
export function closeFinal(state, { present = null, decided } = {}) {
  const R = state.round;
  if (!R || R.phase !== 'final') return null;
  let target;
  let counts = null;
  if (decided !== undefined) target = decided && R.ids.includes(decided) ? decided : null;
  else ({ target, counts } = tallyFinal(state, present));
  if (!target) return resolve(state, 'timeout', { counts });
  return resolve(state, state.secret.spies.includes(target) ? 'caught' : 'framed', { target, counts });
}

/** L'espion se dévoile et tente de deviner le lieu (pendant la manche ou au vote final). */
export function spyGuess(state, by, placeId) {
  const R = state.round;
  if (!R || (R.phase !== 'play' && R.phase !== 'final')) return null;
  if (!state.secret.spies.includes(by) || !R.places.includes(placeId)) return null;
  return resolve(state, placeId === state.secret.place ? 'guessed' : 'missed', { by, guess: placeId });
}

/** Fin de manche : points, statistiques, révélation. */
function resolve(state, outcome, { by = null, target = null, guess = null, counts = null } = {}) {
  const s = clone(state);
  const R = s.round;
  const { spies, place, roles } = s.secret;
  const innocents = R.ids.filter((id) => !spies.includes(id));
  const points = {};
  const add = (id, n) => {
    if (s.players[id]) points[id] = (points[id] || 0) + n;
  };
  if (outcome === 'caught' || outcome === 'missed') {
    innocents.forEach((id) => add(id, POINTS.caught));
    if (outcome === 'caught' && by && innocents.includes(by)) add(by, POINTS.accuserBonus);
  } else if (outcome === 'framed') spies.forEach((id) => add(id, POINTS.spyFramed));
  else if (outcome === 'timeout') spies.forEach((id) => add(id, POINTS.spyTimeout));
  else if (outcome === 'guessed') spies.forEach((id) => add(id, id === by ? POINTS.spyGuess : POINTS.spyMate));

  const spiesWin = outcome === 'framed' || outcome === 'timeout' || outcome === 'guessed';
  for (const id of R.ids) {
    const p = s.players[id];
    if (!p) continue;
    p.score += points[id] || 0;
    if (spies.includes(id)) {
      p.spy += 1;
      if (spiesWin) p.spyWins += 1;
    }
  }
  if (outcome === 'caught' && by && s.players[by] && innocents.includes(by)) s.players[by].caught += 1;
  if (outcome === 'guessed' && s.players[by]) s.players[by].guessed += 1;

  R.phase = 'reveal';
  R.endsAt = null;
  R.acc = null;
  R.result = { outcome, place, spies: [...spies], roles: { ...roles }, by, target, guess, counts, points, spiesWin };
  s.rounds.push({ n: R.n, place, spies: [...spies], outcome, points });
  s.used = [...s.used, place].slice(-40);
  return s;
}

/** La partie est-elle finie selon les réglages ? */
export function gameOver(state) {
  const st = state.settings;
  if (st.endMode === 'rounds') return state.rounds.length >= Number(st.endRounds || 5);
  if (st.endMode === 'score') return Object.values(state.players).some((p) => p.score >= Number(st.endScore || 10));
  return false;
}

// ---------- Classement ----------

export function ranking(state) {
  const list = Object.values(state.players).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fr'));
  let rank = 0;
  let last = null;
  return list.map((p, i) => {
    if (p.score !== last) {
      rank = i + 1;
      last = p.score;
    }
    return { ...p, rank };
  });
}

export function awards(state) {
  const ps = Object.values(state.players);
  const best = (key) => {
    const top = ps.filter((p) => p[key] > 0).sort((a, b) => b[key] - a[key])[0];
    return top && ps.filter((p) => p[key] === top[key]).length === 1 ? top : null;
  };
  const out = [];
  const a = best('spyWins');
  if (a) out.push({ icon: '🕵️', title: 'Espion de génie', p: a, detail: `${a.spyWins} manche${a.spyWins > 1 ? 's' : ''} gagnée${a.spyWins > 1 ? 's' : ''} en espion` });
  const b = best('caught');
  if (b) out.push({ icon: '🔍', title: 'Fin limier', p: b, detail: `${b.caught} espion${b.caught > 1 ? 's' : ''} démasqué${b.caught > 1 ? 's' : ''}` });
  const c = best('guessed');
  if (c) out.push({ icon: '🎯', title: 'Devin', p: c, detail: `${c.guessed} lieu${c.guessed > 1 ? 'x' : ''} deviné${c.guessed > 1 ? 's' : ''}` });
  return out;
}

export function formatClock(ms) {
  const t = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Texte de résultat d'une manche. */
export function outcomeText(state, res) {
  const P = (id) => state.players[id];
  const nm = (id) => (P(id) ? `${P(id).avatar} ${P(id).name}` : 'un joueur parti');
  const spyWord = res.spies.length > 1 ? 'Les espions' : "L'espion";
  switch (res.outcome) {
    case 'caught':
      return { icon: '🎉', title: 'Démasqué !', sub: `${nm(res.target)} était bien un espion.` };
    case 'framed':
      return { icon: '😱', title: 'Raté, innocent !', sub: `${nm(res.target)} connaissait le lieu. ${spyWord} gagne${res.spies.length > 1 ? 'nt' : ''} !` };
    case 'timeout':
      return { icon: '⏰', title: 'Temps écoulé !', sub: `Personne n’a été démasqué : ${spyWord.toLowerCase()} gagne${res.spies.length > 1 ? 'nt' : ''}.` };
    case 'guessed':
      return { icon: '🕵️', title: 'L’espion a trouvé !', sub: `${nm(res.by)} a deviné le lieu.` };
    case 'missed': {
      const g = placeById(res.guess);
      return { icon: '🙈', title: 'L’espion s’est trompé !', sub: `${nm(res.by)} pensait à ${g ? g.name.toLowerCase() : '?'}.` };
    }
  }
  return { icon: '', title: '', sub: '' };
}

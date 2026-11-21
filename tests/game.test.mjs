// Tests des règles : node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/game.js';
import { PLACES, PACKS, placesForPacks } from '../js/places.js';

// Hasard reproductible
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

function game(n = 4, settings = {}) {
  let s = G.newGame('ABCD', settings);
  for (let i = 1; i <= n; i++) s = G.upsertPlayer(s, { id: 'p' + i, name: 'Joueur' + i, avatar: '🦊', color: '#ff4d6d' });
  return s;
}
const ids = (s) => Object.keys(s.players);
const T0 = 1_000_000;

function started(n = 4, settings = {}, seed = 7) {
  let s = G.startRound(game(n, settings), ids(game(n, settings)), T0, { rng: seeded(seed) });
  for (const id of s.round.ids) s = G.markSeen(s, id, T0 + 1000);
  return s;
}

test('les lieux : ids uniques, chaque paquet existe, au moins 6 rôles', () => {
  const seen = new Set();
  for (const p of PLACES) {
    assert.ok(!seen.has(p.id), 'id en double : ' + p.id);
    seen.add(p.id);
    assert.ok(PACKS.some((k) => k.id === p.pack), 'paquet inconnu : ' + p.pack);
    assert.ok(p.roles.length >= 6, 'pas assez de rôles : ' + p.id);
  }
  assert.ok(PLACES.length >= 40);
  assert.equal(placesForPacks([]).length, PLACES.length, 'aucun paquet = tous les lieux');
});

test('il faut au moins 3 joueurs', () => {
  const s = game(2);
  assert.equal(G.startRound(s, ids(s), T0), null);
});

test('nombre d’espions : auto 1 puis 2 à partir de 7, 2 réduit à 1 sous 5 joueurs', () => {
  assert.equal(G.spyCount({ spies: 'auto' }, 6).count, 1);
  assert.equal(G.spyCount({ spies: 'auto' }, 7).count, 2);
  assert.deepEqual(G.spyCount({ spies: 2 }, 4), { count: 1, reduced: true });
  assert.equal(G.spyCount({ spies: 2 }, 5).count, 2);
});

test('distribution : un espion sans lieu, les autres ont le lieu ; rien de secret dans l’état public', () => {
  const s = G.startRound(game(5), ids(game(5)), T0, { rng: seeded(3) });
  assert.equal(s.secret.spies.length, 1);
  const cards = s.round.ids.map((id) => G.cardFor(s, id));
  assert.equal(cards.filter((c) => c.spy).length, 1);
  for (const c of cards.filter((c) => !c.spy)) assert.equal(c.place.id, s.secret.place);
  assert.equal(cards.find((c) => c.spy).place, undefined);
  assert.equal(cards[0].role, undefined, 'pas de rôle par défaut');
  const pub = G.publicState(s);
  assert.equal(pub.secret, undefined);
  assert.ok(!JSON.stringify(pub.round).includes('spies'), 'la liste des espions ne fuit pas');
  assert.ok(s.secret, 'l’état du maître du jeu garde le secret');
  assert.ok(s.round.places.includes(s.secret.place));
});

test('rôles activés : chaque joueur qui connaît le lieu a un rôle du lieu', () => {
  const s = G.startRound(game(6, { roles: true }), ids(game(6)), T0, { rng: seeded(5) });
  const place = PLACES.find((p) => p.id === s.secret.place);
  for (const id of s.round.ids) {
    const c = G.cardFor(s, id);
    if (c.spy) assert.equal(c.role, undefined);
    else assert.ok(place.roles.includes(c.role));
  }
});

test('le chrono démarre quand tout le monde a vu sa carte ; fin du chrono = vote final', () => {
  let s = G.startRound(game(3), ids(game(3)), T0, { rng: seeded(1) });
  s = G.markSeen(s, 'p1', T0);
  s = G.markSeen(s, 'p2', T0);
  assert.equal(s.round.phase, 'deal');
  assert.equal(G.markSeen(s, 'p2', T0), null, 'déjà vu');
  s = G.markSeen(s, 'p3', T0 + 500);
  assert.equal(s.round.phase, 'play');
  assert.equal(s.round.endsAt, T0 + 500 + 8 * 60000);
  assert.equal(G.timeUp(s, T0 + 1000), null, 'pas encore');
  s = G.timeUp(s, s.round.endsAt);
  assert.equal(s.round.phase, 'final');
});

test('mode un téléphone : distribution joueur par joueur', () => {
  let s = G.newGame('ABCD', { phones: 'single' });
  s = G.setPlayers(s, [{ id: 'a', name: 'Léa' }, { id: 'b', name: 'Tom' }, { id: 'c', name: 'Zoé' }]);
  s = G.startRound(s, s.order, T0, { rng: seeded(2) });
  s = G.dealNext(s, T0);
  s = G.dealNext(s, T0);
  assert.equal(s.round.phase, 'deal');
  s = G.dealNext(s, T0 + 10);
  assert.equal(s.round.phase, 'play');
  assert.deepEqual(s.round.seen, ['a', 'b', 'c']);
});

test('pause du chrono', () => {
  let s = started();
  const end = s.round.endsAt;
  s = G.togglePause(s, end - 60000);
  assert.equal(s.round.left, 60000);
  assert.equal(G.remaining(s.round, end + 999999), 60000);
  s = G.togglePause(s, T0 * 3);
  assert.equal(s.round.endsAt, T0 * 3 + 60000);
});

test('tour de parole : on ne repose pas la question à celui qui vient de nous interroger', () => {
  let s = started(4);
  const a = s.round.first;
  const [b, c] = s.round.ids.filter((x) => x !== a);
  assert.equal(G.ask(s, b, c), null, 'ce n’est pas à b de poser la question');
  s = G.ask(s, a, b);
  assert.deepEqual(G.askerInfo(s.round), { asker: b, forbidden: a });
  assert.equal(G.ask(s, b, a), null, 'pas de retour à l’envoyeur');
  s = G.ask(s, b, c);
  assert.equal(G.askerInfo(s.round).asker, c);
  assert.equal(s.round.questions, 2);
});

test('accusation à l’unanimité : un « non » suffit à reprendre la partie (chrono reparti)', () => {
  let s = started(4);
  const spy = s.secret.spies[0];
  const inn = s.round.ids.filter((x) => x !== spy);
  s = G.accuse(s, inn[0], spy, s.round.endsAt - 120000);
  assert.equal(s.round.phase, 'accuse');
  assert.equal(s.round.left, 120000);
  assert.equal(G.accuse(s, inn[1], spy, T0), null, 'une accusation à la fois');
  s = G.vote(s, inn[1], true);
  assert.equal(G.vote(s, spy, true), null, 'l’accusé ne vote pas');
  assert.ok(!G.accusationComplete(s.round));
  s = G.vote(s, inn[2], false);
  assert.ok(G.accusationComplete(s.round));
  s = G.closeAccusation(s, 5 * T0);
  assert.equal(s.round.phase, 'play');
  assert.equal(s.round.endsAt, 5 * T0 + 120000);
  assert.equal(G.accuse(s, inn[0], spy, 5 * T0), null, 'une seule accusation par joueur et par manche');
});

test('espion démasqué : +1 pour chaque innocent, +2 pour l’accusateur', () => {
  let s = started(4);
  const spy = s.secret.spies[0];
  const inn = s.round.ids.filter((x) => x !== spy);
  s = G.accuse(s, inn[0], spy, T0 + 2000);
  s = G.vote(s, inn[1], true);
  s = G.vote(s, inn[2], true);
  s = G.closeAccusation(s, T0 + 3000);
  assert.equal(s.round.phase, 'reveal');
  assert.equal(s.round.result.outcome, 'caught');
  assert.equal(s.players[inn[0]].score, 2);
  assert.equal(s.players[inn[1]].score, 1);
  assert.equal(s.players[spy].score, 0);
  assert.equal(s.players[inn[0]].caught, 1);
  assert.equal(s.players[spy].spy, 1);
});

test('innocent accusé à tort : +4 pour l’espion', () => {
  let s = started(4);
  const spy = s.secret.spies[0];
  const inn = s.round.ids.filter((x) => x !== spy);
  s = G.accuse(s, spy, inn[0], T0 + 2000);
  s = G.vote(s, inn[1], true);
  s = G.vote(s, inn[2], true);
  s = G.closeAccusation(s, T0 + 3000);
  assert.equal(s.round.result.outcome, 'framed');
  assert.equal(s.players[spy].score, 4);
  assert.equal(s.players[spy].spyWins, 1);
});

test('majorité : 2 oui sur 3 votants suffisent ; un joueur connecté qui ne vote pas compte « non »', () => {
  let s = started(5, { vote: 'majority' });
  const spy = s.secret.spies[0];
  const inn = s.round.ids.filter((x) => x !== spy);
  s = G.accuse(s, inn[0], spy, T0 + 2000);
  s = G.vote(s, inn[1], true);
  // inn[2] et inn[3] connectés mais n'ont pas voté : 2 oui sur 4 → pas de majorité
  const kept = G.closeAccusation(s, T0 + 3000);
  assert.equal(kept.round.phase, 'play');
  // inn[3] est déconnecté : 2 oui sur 3 → démasqué
  const present = s.round.ids.filter((x) => x !== inn[3]);
  const done = G.closeAccusation(s, T0 + 3000, { present });
  assert.equal(done.round.result.outcome, 'caught');
});

test('l’espion devine le lieu : +4 ; se trompe : +1 pour les innocents ; un innocent ne peut pas « deviner »', () => {
  const s = started(4);
  const spy = s.secret.spies[0];
  const inn = s.round.ids.find((x) => x !== spy);
  assert.equal(G.spyGuess(s, inn, s.secret.place), null);
  const ok = G.spyGuess(s, spy, s.secret.place);
  assert.equal(ok.round.result.outcome, 'guessed');
  assert.equal(ok.players[spy].score, 4);
  assert.equal(ok.players[spy].guessed, 1);
  const wrong = s.round.places.find((p) => p !== s.secret.place);
  const ko = G.spyGuess(s, spy, wrong);
  assert.equal(ko.round.result.outcome, 'missed');
  assert.equal(ko.players[inn].score, 1);
  assert.equal(ko.players[spy].score, 0);
});

test('vote final : égalité ou pas d’unanimité = l’espion gagne (+2) ; unanimité contre l’espion = démasqué', () => {
  let s = started(4);
  s = G.timeUp(s, s.round.endsAt);
  const spy = s.secret.spies[0];
  const inn = s.round.ids.filter((x) => x !== spy);
  let a = G.finalVote(s, inn[0], spy);
  a = G.finalVote(a, inn[1], spy);
  a = G.finalVote(a, inn[2], inn[0]);
  a = G.finalVote(a, spy, inn[0]);
  assert.ok(G.finalComplete(a.round));
  const pub = G.publicState(a);
  assert.deepEqual(pub.round.fvotes, {}, 'les votes restent cachés avant la révélation');
  assert.equal(pub.round.fvoted.length, 4);
  const r1 = G.closeFinal(a);
  assert.equal(r1.round.result.outcome, 'timeout');
  assert.equal(r1.players[spy].score, 2);

  let b = s;
  for (const v of inn) b = G.finalVote(b, v, spy);
  b = G.finalVote(b, spy, inn[0]);
  const r2 = G.closeFinal(b);
  assert.equal(r2.round.result.outcome, 'caught');
  assert.equal(r2.players[inn[0]].score, 1, 'pas de bonus d’accusateur au vote final');
});

test('mode un téléphone : accusation et vote final décidés à main levée', () => {
  let s = started(4, { phones: 'single' });
  const spy = s.secret.spies[0];
  const inn = s.round.ids.filter((x) => x !== spy);
  const a = G.closeAccusation(G.accuse(s, inn[0], inn[1], T0 + 5), T0 + 6, { decided: false });
  assert.equal(a.round.phase, 'play');
  const b = G.closeAccusation(G.accuse(s, inn[0], spy, T0 + 5), T0 + 6, { decided: true });
  assert.equal(b.round.result.outcome, 'caught');
  const f = G.timeUp(s, s.round.endsAt);
  assert.equal(G.closeFinal(f, { decided: '' }).round.result.outcome, 'timeout');
  assert.equal(G.closeFinal(f, { decided: inn[1] }).round.result.outcome, 'framed');
});

test('deux espions : chacun gagne quand un innocent est accusé', () => {
  let s = started(7, {}, 11);
  assert.equal(s.secret.spies.length, 2);
  const [s1, s2] = s.secret.spies;
  const inn = s.round.ids.filter((x) => !s.secret.spies.includes(x));
  s = G.accuse(s, s1, inn[0], T0 + 10);
  for (const v of s.round.ids) if (v !== inn[0] && v !== s1) s = G.vote(s, v, true);
  s = G.closeAccusation(s, T0 + 20);
  assert.equal(s.players[s1].score, 4);
  assert.equal(s.players[s2].score, 4);
  const card = G.cardFor(G.startRound(s, s.order, T0, { rng: seeded(11) }), s1);
  assert.ok(card);
});

test('fin de partie au nombre de manches ou au score', () => {
  let s = started(4, { endMode: 'rounds', endRounds: 1 });
  assert.ok(!G.gameOver(s));
  s = G.spyGuess(s, s.secret.spies[0], s.secret.place);
  assert.ok(G.gameOver(s));
  const sc = G.setSettings(s, { endMode: 'score', endScore: 5 });
  assert.ok(!G.gameOver(sc));
  assert.ok(!G.gameOver(G.setSettings(s, { endMode: 'free' })));
});

test('un joueur qui change de téléphone garde ses points et sa carte', () => {
  let s = started(4);
  const spy = s.secret.spies[0];
  const moved = G.movePlayer(s, spy, 'nouveau');
  assert.ok(moved.players.nouveau);
  assert.ok(!moved.players[spy]);
  assert.deepEqual(moved.secret.spies, ['nouveau']);
  assert.ok(G.cardFor(moved, 'nouveau').spy);
  assert.ok(moved.round.ids.includes('nouveau'));
});

test('lieux récents évités, nouvelle partie remet les scores à zéro', () => {
  let s = game(4, { packs: ['vacances'] });
  const seen = [];
  for (let i = 0; i < 4; i++) {
    s = G.startRound(s, ids(s), T0, { rng: Math.random });
    seen.push(s.secret.place);
    s = G.spyGuess(G.forceStart(s, T0), s.secret.spies[0], s.secret.place);
  }
  assert.equal(new Set(seen).size, 4, 'pas de répétition sur 4 manches avec 10 lieux');
  const r = G.resetScores(s);
  assert.ok(Object.values(r.players).every((p) => p.score === 0));
  assert.equal(r.rounds.length, 0);
  assert.equal(r.round, null);
});

test('un nouveau joueur arrivé en cours de manche n’a pas de carte', () => {
  let s = started(3);
  s = G.upsertPlayer(s, { id: 'late', name: 'Retard' });
  assert.equal(G.cardFor(s, 'late'), null);
});

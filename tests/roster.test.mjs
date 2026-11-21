// Tests des joueurs enregistrés : node --test tests/roster.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRosterStore, parseUndercover, mergeImport } from '../js/roster.js';
import * as G from '../js/game.js';

const memStore = () => {
  const m = {};
  return { get: (k, d) => (k in m ? JSON.parse(m[k]) : d), set: (k, v) => (m[k] = JSON.stringify(v)) };
};
const ucfCode = (o) => 'UCF2:' + Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

test('groupes par défaut, ajout, doublon de prénom refusé, filtre par groupe', () => {
  const r = createRosterStore(memStore());
  assert.deepEqual(r.groups.map((g) => g.name), ['Famille', 'Amis', 'Travail']);
  r.add('Léa', { groupId: 'famille' });
  r.add('Tom', { groupId: 'amis' });
  assert.throws(() => r.add('léa'), /existe déjà/);
  assert.deepEqual(r.inGroup('famille').map((p) => p.name), ['Léa']);
  assert.equal(r.inGroup('').length, 2);
  const tom = r.findByName('TOM');
  r.toggleGroup(tom.id, 'famille');
  assert.deepEqual(r.inGroup('famille').map((p) => p.name), ['Léa', 'Tom']);
});

test('suppression d’un groupe : les joueurs restent', () => {
  const r = createRosterStore(memStore());
  r.add('Léa', { groupId: 'travail' });
  r.removeGroup('travail');
  assert.equal(r.players.length, 1);
  assert.deepEqual(r.players[0].groups, []);
});

test('import Undercover (code UCF2 et JSON) avec accents, fusion sans doublon', () => {
  const data = {
    app: 'undercover-famille',
    v: 2,
    roster: [
      { id: 'a1', name: 'Zoé', emoji: '🦄', color: '#a3e635', groups: ['famille', 'g9'] },
      { id: 'a2', name: 'Léa', emoji: '🐼', color: '#ff5d73', groups: ['g9'] },
    ],
    groups: [{ id: 'famille', name: 'Famille', icon: '🏠' }, { id: 'g9', name: 'Foot', icon: '⚽' }],
  };
  const parsed = parseUndercover(ucfCode(data));
  assert.equal(parsed.players[0].avatar, '🦄');
  assert.deepEqual(parseUndercover(JSON.stringify(data)).players.map((p) => p.name), ['Zoé', 'Léa']);
  const r = createRosterStore(memStore());
  r.add('léa', { groupId: 'amis' });
  const n = r.importUndercover(ucfCode(data));
  assert.equal(n, 1, 'Léa existait déjà');
  assert.ok(r.groups.some((g) => g.name === 'Foot'));
  assert.deepEqual(r.findByName('Léa').groups.sort(), ['amis', 'g9']);
  assert.throws(() => parseUndercover('UCF2:abc'), /illisible/);
  assert.throws(() => parseUndercover('{"app":"autre"}'), /Undercover/);
});

test('un joueur reprend sa place depuis un autre téléphone (points)', () => {
  let s = G.newGame('T');
  s = G.upsertPlayer(s, { id: 'old', name: 'Léa' });
  s = G.adjustScore(s, 'old', 3);
  s = G.movePlayer(s, 'old', 'new');
  assert.equal(s.players.old, undefined);
  assert.equal(s.players.new.score, 3);
  assert.equal(s.players.new.id, 'new');
  assert.deepEqual(s.order, ['new']);
});

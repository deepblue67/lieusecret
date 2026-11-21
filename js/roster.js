// Joueurs enregistrés et groupes, conservés sur le téléphone du maître du jeu
// (comme dans Undercover). Un joueur peut appartenir à plusieurs groupes.
import { randomId } from './game.js';

export const GROUP_ICONS = ['🏠', '🎉', '💼', '⚽', '🎒', '🏖️', '🎲', '🎵', '🌳', '⭐', '👥', '🍕'];
export const DEFAULT_GROUPS = [
  { id: 'famille', name: 'Famille', icon: '🏠' },
  { id: 'amis', name: 'Amis', icon: '🎉' },
  { id: 'travail', name: 'Travail', icon: '💼' },
];

const str = (v, n) => String(v ?? '').trim().slice(0, n);

export function cleanGroup(g) {
  return { id: str(g.id, 40) || randomId(8), name: str(g.name, 20) || 'Groupe', icon: str(g.icon, 8) || '👥' };
}

export function cleanEntry(p) {
  return {
    id: str(p.id, 40) || randomId(10),
    name: str(p.name, 16),
    avatar: str(p.avatar || p.emoji, 8) || '🙂', // "emoji" : format Undercover
    color: /^#[0-9a-f]{3,8}$/i.test(p.color || '') ? p.color : '#ff4d6d',
    groups: Array.isArray(p.groups) ? p.groups.map(String).slice(0, 12) : [],
  };
}

const sameName = (a, b) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');
export const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/**
 * Lit les données exportées par Undercover : code « UCF2:… » à copier-coller
 * ou contenu du fichier .json de sauvegarde. Renvoie { players, groups }.
 */
export function parseUndercover(txt) {
  const t = String(txt || '').trim();
  if (!t) throw new Error('Rien à importer : colle un code ou choisis un fichier');
  let json = t;
  if (t[0] !== '{') {
    try {
      const bin = atob(t.replace(/^UCF\d*:/, '').replace(/\s+/g, ''));
      json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch {
      throw new Error('Code illisible : vérifie qu’il est complet');
    }
  }
  let o;
  try {
    o = JSON.parse(json);
  } catch {
    throw new Error('Code illisible : vérifie qu’il est complet');
  }
  if (!o || o.app !== 'undercover-famille') throw new Error('Ces données ne viennent pas d’Undercover');
  const arr = (x) => (Array.isArray(x) ? x : []);
  return {
    players: arr(o.roster).filter((p) => p && str(p.name, 16)).map(cleanEntry),
    groups: arr(o.groups).filter((g) => g && g.name).map(cleanGroup),
  };
}

/** Fusionne des données importées : rien n'est écrasé, les doublons de prénom sont réunis. */
export function mergeImport(roster, groups, data) {
  const R = roster.map((p) => ({ ...p, groups: [...p.groups] }));
  const G = groups.map((g) => ({ ...g }));
  const gmap = {}; // id importé -> id local
  for (const g of data.groups) {
    const local = G.find((x) => x.id === g.id) || G.find((x) => sameName(x.name, g.name));
    if (local) gmap[g.id] = local.id;
    else {
      G.push(g);
      gmap[g.id] = g.id;
    }
  }
  let added = 0;
  for (const p of data.players) {
    const gs = p.groups.map((id) => gmap[id]).filter(Boolean);
    const local = R.find((x) => sameName(x.name, p.name));
    if (local) local.groups = [...new Set([...local.groups, ...gs])];
    else {
      R.push({ ...p, id: R.some((x) => x.id === p.id) ? randomId(10) : p.id, groups: gs });
      added++;
    }
  }
  return { roster: R, groups: G, added };
}

/** Magasin : lecture/écriture dans le stockage du navigateur. */
export function createRosterStore(store) {
  const api = {
    groups: (store.get('lieu-groups', null) || DEFAULT_GROUPS).map(cleanGroup),
    players: (store.get('lieu-roster', null) || []).map(cleanEntry).filter((p) => p.name),
    save() {
      store.set('lieu-groups', api.groups);
      store.set('lieu-roster', api.players);
    },
    group(id) {
      return api.groups.find((g) => g.id === id) || null;
    },
    /** Joueurs du groupe (tous si groupId est vide). */
    inGroup(groupId) {
      return api.players.filter((p) => !groupId || p.groups.includes(groupId)).sort(byName);
    },
    findByName(name) {
      return api.players.find((p) => sameName(p.name, name)) || null;
    },
    add(name, { groupId = '', avatar, color } = {}) {
      name = str(name, 16);
      if (!name) throw new Error('Écris un prénom ✏️');
      if (api.findByName(name)) throw new Error(`${name} existe déjà`);
      const p = cleanEntry({ id: randomId(10), name, avatar, color, groups: groupId ? [groupId] : [] });
      api.players.push(p);
      api.save();
      return p;
    },
    update(id, patch) {
      const p = api.players.find((x) => x.id === id);
      if (!p) return null;
      if (patch.name != null) {
        const n = str(patch.name, 16);
        if (!n) throw new Error('Le prénom ne peut pas être vide');
        if (api.players.some((x) => x.id !== id && sameName(x.name, n))) throw new Error(`${n} existe déjà`);
        p.name = n;
      }
      if (patch.avatar) p.avatar = str(patch.avatar, 8);
      if (patch.color) p.color = cleanEntry({ color: patch.color }).color;
      api.save();
      return p;
    },
    remove(id) {
      api.players = api.players.filter((p) => p.id !== id);
      api.save();
    },
    toggleGroup(id, groupId) {
      const p = api.players.find((x) => x.id === id);
      if (!p) return;
      p.groups = p.groups.includes(groupId) ? p.groups.filter((g) => g !== groupId) : [...p.groups, groupId];
      api.save();
    },
    addGroup(name) {
      name = str(name, 20);
      if (!name) throw new Error('Écris le nom du groupe ✏️');
      if (api.groups.some((g) => sameName(g.name, name))) throw new Error('Ce groupe existe déjà');
      const g = { id: randomId(8), name, icon: GROUP_ICONS[api.groups.length % GROUP_ICONS.length] };
      api.groups.push(g);
      api.save();
      return g;
    },
    renameGroup(id, name) {
      const g = api.group(id);
      name = str(name, 20);
      if (!g || !name) return;
      g.name = name;
      api.save();
    },
    cycleGroupIcon(id) {
      const g = api.group(id);
      if (!g) return;
      g.icon = GROUP_ICONS[(GROUP_ICONS.indexOf(g.icon) + 1) % GROUP_ICONS.length];
      api.save();
    },
    removeGroup(id) {
      if (api.groups.length <= 1) throw new Error('Garde au moins un groupe');
      api.groups = api.groups.filter((g) => g.id !== id);
      for (const p of api.players) p.groups = p.groups.filter((g) => g !== id);
      api.save();
    },
    importUndercover(txt) {
      const r = mergeImport(api.players, api.groups, parseUndercover(txt));
      api.players = r.roster;
      api.groups = r.groups;
      api.save();
      return r.added;
    },
  };
  return api;
}

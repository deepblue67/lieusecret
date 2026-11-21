// Couche réseau : Supabase Realtime (Broadcast + Presence) ou mode "local"
// (BroadcastChannel entre onglets d'un même navigateur, pour tester sans Supabase).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const EVENTS = ['hello', 'state', 'card', 'act', 'fx', 'need-state', 'join-err'];

export function isLocalMode() {
  const p = new URLSearchParams(location.search);
  if (p.get('local') === '1') return true;
  return !SUPABASE_URL || SUPABASE_URL.includes('VOTRE') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('VOTRE');
}

/**
 * createTransport(room, { key, meta, onStatus })
 *  - key  : identifiant unique de ce client dans la salle
 *  - meta : infos de présence ({ role: 'host' | 'player' | 'tv', id })
 * Renvoie { send(event, payload), on(event, fn), onPresence(fn), status, local }
 */
export function createTransport(room, opts) {
  return isLocalMode() ? localTransport(room, opts) : supabaseTransport(room, opts);
}

function makeBus() {
  const handlers = {};
  const presenceHandlers = [];
  return {
    handlers,
    presenceHandlers,
    on(ev, fn) {
      (handlers[ev] ||= []).push(fn);
    },
    onPresence(fn) {
      presenceHandlers.push(fn);
    },
    emit(ev, payload) {
      (handlers[ev] || []).forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error(e);
        }
      });
    },
    emitPresence(list) {
      presenceHandlers.forEach((fn) => fn(list));
    },
  };
}

// ---------------------------------------------------------------- Supabase
function supabaseTransport(room, { key, meta, onStatus }) {
  const bus = makeBus();
  const api = {
    local: false,
    status: 'connecting',
    on: bus.on,
    onPresence: bus.onPresence,
    send() {},
  };
  if (!window.supabase || !window.supabase.createClient) {
    console.error('Bibliothèque Supabase introuvable (js/vendor/supabase.js)');
    setTimeout(() => onStatus && onStatus('offline'), 0);
    return api;
  }
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 50 } },
  });
  const ch = client.channel('lieu:' + room, {
    config: { broadcast: { self: false, ack: false }, presence: { key } },
  });
  for (const ev of EVENTS) ch.on('broadcast', { event: ev }, (msg) => bus.emit(ev, msg.payload));
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState();
    const list = [];
    for (const k of Object.keys(st)) {
      const m = st[k][0];
      if (m) list.push({ ...m, key: k });
    }
    bus.emitPresence(list);
  });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      api.status = 'online';
      ch.track(meta);
      onStatus && onStatus('online');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      api.status = 'offline';
      onStatus && onStatus('offline');
    }
  });
  api.send = (event, payload) => {
    ch.send({ type: 'broadcast', event, payload }).catch?.(() => {});
  };
  api.updateMeta = (m) => {
    Object.assign(meta, m);
    if (api.status === 'online') ch.track(meta);
  };
  return api;
}

// ---------------------------------------------------------------- Local
// Paramètres d'URL pour les tests : &lat=300 (latence max simulée en ms, en
// montée ET en descente, tirée au hasard pour chaque message) et &skew=5000
// (décalage d'horloge simulé, géré dans common.js).
function localTransport(room, { key, meta, onStatus }) {
  const bus = makeBus();
  const params = new URLSearchParams(location.search);
  const lat = Number(params.get('lat') || 0);
  const delay = () => (lat ? lat * (0.3 + 0.7 * Math.random()) : 0);
  const bc = new BroadcastChannel('lieu-local-' + room);
  const peers = new Map(); // key -> { meta, seen }

  const publishPresence = () => {
    const now = Date.now();
    for (const [k, v] of peers) if (now - v.seen > 3500) peers.delete(k);
    bus.emitPresence([{ ...meta, key }, ...[...peers].map(([k, v]) => ({ ...v.meta, key: k }))]);
  };

  bc.onmessage = (e) => {
    const m = e.data;
    if (m.__presence) {
      const isNew = !peers.has(m.key);
      peers.set(m.key, { meta: m.meta, seen: Date.now() });
      if (isNew) publishPresence();
      return;
    }
    if (m.__leave) {
      peers.delete(m.key);
      publishPresence();
      return;
    }
    setTimeout(() => bus.emit(m.event, m.payload), delay());
  };
  const beat = () => bc.postMessage({ __presence: true, key, meta });
  setInterval(() => {
    beat();
    publishPresence();
  }, 1000);
  addEventListener('pagehide', () => bc.postMessage({ __leave: true, key }));

  const api = {
    local: true,
    status: 'online',
    on: bus.on,
    onPresence: bus.onPresence,
    send(event, payload) {
      setTimeout(() => bc.postMessage({ event, payload }), delay());
    },
    updateMeta(m) {
      Object.assign(meta, m);
      beat();
    },
  };
  setTimeout(() => {
    beat();
    publishPresence();
    onStatus && onStatus('online');
  }, 50);
  return api;
}

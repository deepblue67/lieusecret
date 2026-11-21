// Outils partagés par toutes les pages.
import { randomId } from './game.js';

export const params = new URLSearchParams(location.search);

export const now = () => Date.now();

export const AVATARS = ['🦊', '🐸', '🐼', '🐯', '🦁', '🐵', '🐙', '🦄', '🐲', '🐧', '🦉', '🐻', '🐨', '🐷', '🐮', '🐰', '🦖', '🐝', '🦀', '🐳', '👽', '🤖', '👻', '🎃', '🤠', '🥷', '🧙', '🦸', '🍕', '🌵', '🐶', '🐱', '🦋', '🐢'];
export const COLORS = ['#ff4d6d', '#ff9f1c', '#ffd60a', '#70e000', '#2ec4b6', '#00b4d8', '#4361ee', '#9d4edd', '#f15bb5', '#8d6e63'];

export function getRoom() {
  return (params.get('r') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export function makeRoomCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O
  let s = '';
  for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s;
}

/** Garde les paramètres de test (local, lat) dans les liens internes. */
export function link(page, extra = {}) {
  const p = new URLSearchParams();
  for (const k of ['local', 'lat']) if (params.get(k)) p.set(k, params.get(k));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const qs = p.toString();
  return page + (qs ? '?' + qs : '');
}

/** URL absolue d'une page de l'appli (pour le QR code). */
export function absUrl(page, extra = {}) {
  return new URL(link(page, extra), location.href).href;
}

export const store = {
  get(k, def = null) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

/** Identifiant stable de cet appareil (par onglet en mode test local). */
/** Nouveau joueur sur ce téléphone : on oublie l'identifiant du précédent. */
export function resetDeviceId() {
  if (params.get('local') === '1') sessionStorage.removeItem('lieu-id');
  else store.del('lieu-id');
}

export function deviceId() {
  const key = params.get('local') === '1' ? null : 'lieu-id';
  if (key) {
    let id = store.get(key);
    if (!id) store.set(key, (id = randomId(12)));
    return id;
  }
  let id = sessionStorage.getItem('lieu-id');
  if (!id) sessionStorage.setItem('lieu-id', (id = randomId(12)));
  return id;
}

/** Profil joueur : en mode local, stocké par onglet pour simuler plusieurs téléphones. */
export const profileStore = {
  get() {
    if (params.get('local') === '1') {
      try {
        return JSON.parse(sessionStorage.getItem('lieu-profile'));
      } catch {
        return null;
      }
    }
    return store.get('lieu-profile');
  },
  set(p) {
    if (params.get('local') === '1') sessionStorage.setItem('lieu-profile', JSON.stringify(p));
    else store.set('lieu-profile', p);
  },
};

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, ms = 2200) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** Empêche l'écran de se mettre en veille pendant la partie. */
export function keepAwake() {
  let lock = null;
  const req = async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
    } catch {}
  };
  req();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') req();
  });
  return () => lock && lock.release();
}

/** Petit indicateur de connexion. */
export function setConn(status, local) {
  const el = $('#conn');
  if (!el) return;
  el.className = 'conn ' + status;
  el.title = local ? 'Mode local (test)' : status === 'online' ? 'Connecté' : 'Connexion…';
  el.textContent = local ? 'LOCAL' : '';
}

/** SVG du QR code (bibliothèque qrcode-generator chargée en global). */
export function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

// Cartes secrètes chiffrées de bout en bout (ECDH P-256 + AES-GCM, WebCrypto).
// Chaque téléphone joueur crée une paire de clés et envoie sa clé publique au
// maître du jeu, qui chiffre la carte pour lui seul. Les autres téléphones (et la
// TV) voient passer le message mais ne peuvent pas le lire.
// Sans WebCrypto (page ouverte en http:// sur le réseau local), la carte part en clair.

const subtle = globalThis.crypto && globalThis.crypto.subtle;
export const cryptoOk = !!subtle;

const b64 = (buf) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ALGO = { name: 'ECDH', namedCurve: 'P-256' };

export async function makeKeys() {
  if (!subtle) return null;
  try {
    const kp = await subtle.generateKey(ALGO, false, ['deriveKey']);
    return { kp, pub: b64(await subtle.exportKey('raw', kp.publicKey)) };
  } catch {
    return null;
  }
}

const cache = new Map();
function shared(keys, otherPub) {
  const k = keys.pub + '|' + otherPub;
  if (!cache.has(k)) {
    cache.set(
      k,
      (async () => {
        const other = await subtle.importKey('raw', unb64(otherPub), ALGO, false, []);
        return subtle.deriveKey({ name: 'ECDH', public: other }, keys.kp.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      })()
    );
  }
  return cache.get(k);
}

/** Chiffre `obj` pour le détenteur de `otherPub` (en clair si l'un des deux n'a pas WebCrypto). */
export async function seal(keys, otherPub, obj) {
  if (!keys || !otherPub) return { plain: obj };
  try {
    const key = await shared(keys, otherPub);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct), from: keys.pub };
  } catch {
    return { plain: obj };
  }
}

export async function unseal(keys, msg) {
  if (msg.plain) return msg.plain;
  if (!keys || !msg.from) throw new Error('Carte illisible');
  const key = await shared(keys, msg.from);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(msg.iv) }, key, unb64(msg.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// Rendu partagé par le maître du jeu, les joueurs et la TV.
import { esc } from './common.js';
import { ranking, awards, formatClock, outcomeText, askerInfo, accVoters } from './game.js';
import { placeById } from './places.js';

const MEDALS = ['🥇', '🥈', '🥉'];
export const GONE = { name: '(parti)', avatar: '👋', color: '#666' };

export function avatarBubble(p, size = '') {
  return `<span class="av ${size}" style="--c:${esc(p?.color || '#888')}">${esc(p?.avatar || '❔')}</span>`;
}
export const nameOf = (state, id) => {
  const p = state.players[id] || GONE;
  return `${esc(p.avatar)} ${esc(p.name)}`;
};
export const plural = (n, w, pl = w + 's') => `${n} ${n > 1 ? pl : w}`;

/** Remplace le contenu d'un conteneur en animant les éléments qui changent de place (FLIP). */
export function flipRender(container, html) {
  if (container.dataset.html === html) return;
  container.dataset.html = html;
  const before = new Map();
  for (const el of container.querySelectorAll('[data-key]')) before.set(el.dataset.key, el.getBoundingClientRect().top);
  container.innerHTML = html;
  for (const el of container.querySelectorAll('[data-key]')) {
    const old = before.get(el.dataset.key);
    if (old == null) continue;
    const dy = old - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) el.animate?.([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  }
}

// ---------- Classement & podium ----------

export function boardHtml(state, { me = null, online = null, host = false, last = null } = {}) {
  const list = ranking(state);
  if (!list.length) return `<div class="empty">Aucun joueur pour l’instant.</div>`;
  return list
    .map((p) => {
      const off = online && !online.has(p.id);
      const medal = p.score > 0 && p.rank <= 3 ? MEDALS[p.rank - 1] : `<span class="rk">${p.rank}</span>`;
      const gain = last && last[p.id] ? `<span class="gain">+${last[p.id]}</span>` : '';
      const ctl = host
        ? `<span class="ctl"><button data-act="minus" data-id="${esc(p.id)}">−1 point</button><button data-act="plus" data-id="${esc(p.id)}">+1 point</button>${online ? `<button data-act="kick" data-id="${esc(p.id)}" class="kick">🚪 Exclure</button>` : ''}</span>`
        : '';
      return `<li data-key="${esc(p.id)}" class="brow ${p.id === me ? 'me' : ''} ${off ? 'off' : ''}" style="--c:${esc(p.color)}">
        <span class="medal">${medal}</span>${avatarBubble(p)}
        <span class="nm">${esc(p.name)}${p.id === me ? ' <em>(toi)</em>' : ''}${off ? ' <small>· déconnecté</small>' : ''}</span>
        ${gain}<span class="sc">${p.score}</span>${ctl}</li>`;
    })
    .join('');
}

export function podiumHtml(state) {
  const list = ranking(state);
  if (!list.some((p) => p.score > 0)) {
    return `<h2 class="ptitle">🏁 Fin de partie !</h2><p class="big-txt">🤷 Personne n’a marqué de point… revanche ?</p>`;
  }
  const top3 = [list[1], list[0], list[2]];
  const steps = top3
    .map((p, i) => {
      if (!p) return '<div class="step empty"></div>';
      const place = [2, 1, 3][i];
      return `<div class="step s${place}" style="--c:${esc(p.color)}">
        <div class="pav">${esc(p.avatar)}</div><div class="pname">${esc(p.name)}</div>
        <div class="block"><span>${MEDALS[Math.min(p.rank, 3) - 1]}</span><b>${p.score} pt${Math.abs(p.score) > 1 ? 's' : ''}</b></div></div>`;
    })
    .join('');
  const aw = awards(state)
    .map((a) => `<li style="--c:${esc(a.p.color)}"><span class="aicon">${a.icon}</span><span><b>${esc(a.title)}</b><br>${esc(a.p.avatar)} ${esc(a.p.name)} · ${esc(a.detail)}</span></li>`)
    .join('');
  return `<h2 class="ptitle">🏁 Fin de partie !</h2><div class="podium">${steps}</div>${aw ? `<ul class="awards">${aw}</ul>` : ''}`;
}

// ---------- La carte secrète ----------

export function cardInner(card) {
  if (!card) return '<div class="ctext">…</div>';
  if (card.spy) {
    return `<div class="cemoji">🕵️</div><div class="ctitle spy">Tu es l’espion !</div>
      <div class="ctext">Tu ne connais pas le lieu. Écoute bien les questions pour le deviner… sans te faire repérer.</div>
      ${card.mates > 1 ? `<div class="ctext small">Vous êtes ${card.mates} espions, et tu ne sais pas qui est l’autre.</div>` : ''}`;
  }
  return `<div class="ctext small">Le lieu secret est…</div><div class="cemoji">${esc(card.place.emoji)}</div>
    <div class="ctitle">${esc(card.place.name)}</div>
    ${card.role ? `<div class="crole">Tu es : <b>${esc(card.role)}</b></div>` : ''}`;
}

/** Carte à retourner en gardant le doigt dessus (personne ne la voit par-dessus l'épaule). */
export function holdCardHtml(card, { compact = false, hint = 'Garde ton doigt ici<br>pour voir ta carte' } = {}) {
  return `<div class="hold ${compact ? 'compact' : ''}" data-hold="1"><div class="fc">
    <div class="face front"><div class="hint"><span class="big">👆</span>${hint}</div></div>
    <div class="face back"><div class="cin">${cardInner(card)}</div></div></div></div>`;
}

/** Active les cartes à retourner d'un conteneur. onReveal(el) au premier retournement. */
export function bindHold(root, onReveal) {
  const on = (e) => {
    const h = e.target.closest('[data-hold]');
    if (!h) return;
    e.preventDefault();
    h.classList.add('on');
    if (!h.dataset.seen) {
      h.dataset.seen = '1';
      onReveal && onReveal(h);
    }
  };
  const off = () => root.querySelectorAll('[data-hold].on').forEach((h) => h.classList.remove('on'));
  root.addEventListener('pointerdown', on);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(ev, off);
  addEventListener('blur', off);
  root.addEventListener('contextmenu', (e) => e.target.closest('[data-hold]') && e.preventDefault());
}

// ---------- Liste des lieux ----------

/**
 * Grille des lieux possibles. crossed : Set d'ids barrés. mode :
 *  - 'cross' : toucher un lieu le barre (aide-mémoire du joueur)
 *  - 'pick'  : toucher un lieu le sélectionne (l'espion choisit sa réponse)
 *  - ''      : simple affichage
 */
export function placesHtml(ids, { crossed = null, mode = '', sel = null, mark = null, guess = null } = {}) {
  return ids
    .map((id) => {
      const p = placeById(id);
      if (!p) return '';
      const cls = [crossed && crossed.has(id) ? 'x' : '', sel === id ? 'sel' : '', mark === id ? 'good' : '', guess === id && guess !== mark ? 'bad' : ''].join(' ');
      const tag = mode ? 'button' : 'div';
      return `<${tag} class="ptile ${cls}" ${mode ? `data-place="${esc(id)}" type="button"` : ''}><span class="pe">${esc(p.emoji)}</span><span class="pn">${esc(p.name)}</span></${tag}>`;
    })
    .join('');
}

// ---------- Joueurs à choisir ----------

/** Puces de joueurs cliquables. act : data-act ; dis : ids désactivés ; sel : id sélectionné. */
export function playerChips(state, ids, { act = 'pickp', dis = [], sel = null, me = null, extra = {} } = {}) {
  const ex = Object.entries(extra).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<div class="pchips">${ids
    .map((id) => {
      const p = state.players[id] || GONE;
      return `<button type="button" class="who-chip ${sel === id ? 'on' : ''}" data-act="${act}" data-id="${esc(id)}" ${ex} style="--c:${esc(p.color)}" ${dis.includes(id) ? 'disabled' : ''}>${avatarBubble(p)}${esc(p.name)}${id === me ? ' <em>(toi)</em>' : ''}</button>`;
    })
    .join('')}</div>`;
}

// ---------- Chrono ----------

export function clockText(ms) {
  return formatClock(ms);
}

// ---------- Tour de parole ----------

export function turnHtml(state) {
  const R = state.round;
  if (!R || !R.turn) return '';
  if (!R.turn.to) return `<span class="turn">🎤 ${nameOf(state, R.turn.from)} pose la première question</span>`;
  return `<span class="turn">🎤 ${nameOf(state, R.turn.from)} <b class="arrow">➜</b> ${nameOf(state, R.turn.to)}</span>`;
}

export { askerInfo };

// ---------- Accusation & vote final ----------

export function accusationHtml(state, present = null) {
  const R = state.round;
  const a = R.acc;
  const voters = accVoters(R, present);
  const rows = voters
    .map((id) => {
      const v = a.votes[id];
      const p = state.players[id] || GONE;
      return `<li style="--c:${esc(p.color)}" data-key="${esc(id)}">${avatarBubble(p)}<span class="nm">${esc(p.name)}</span><span class="vote ${v === true ? 'yes' : v === false ? 'no' : ''}">${v === true ? '👍 Oui' : v === false ? '👎 Non' : '⏳'}</span></li>`;
    })
    .join('');
  const need = state.settings.vote === 'majority' ? 'Il faut la majorité des votes.' : 'Il faut que tout le monde soit d’accord.';
  return `<div class="accuse-head">${avatarBubble(state.players[a.by] || GONE, 'lg')}<span class="bang">🫵</span>${avatarBubble(state.players[a.target] || GONE, 'xl')}</div>
    <p class="big-txt">${esc((state.players[a.by] || GONE).name)} accuse ${esc((state.players[a.target] || GONE).name)} !</p>
    <p class="muted small">${need}</p><ul class="list votes">${rows}</ul>`;
}

// ---------- Révélation ----------

export function resultHtml(state, { me = null } = {}) {
  const R = state.round;
  const res = R.result;
  const o = outcomeText(state, res);
  const place = placeById(res.place);
  const spies = res.spies.map((id) => `<span class="spy-chip" style="--c:${esc((state.players[id] || GONE).color)}">${nameOf(state, id)}</span>`).join(' ');
  const roles = Object.keys(res.roles || {}).length
    ? `<details class="roles"><summary>🎭 Les rôles</summary><ul>${Object.entries(res.roles)
        .map(([id, r]) => `<li>${nameOf(state, id)} : ${esc(r)}</li>`)
        .join('')}</ul></details>`
    : '';
  const pts = Object.entries(res.points || {})
    .filter(([, n]) => n)
    .map(([id, n]) => `<li style="--c:${esc((state.players[id] || GONE).color)}" class="${id === me ? 'me' : ''}">${avatarBubble(state.players[id] || GONE)}<span class="nm">${esc((state.players[id] || GONE).name)}</span><span class="gain">+${n}</span></li>`)
    .join('');
  let tally = '';
  if (res.counts && Object.keys(res.counts).length) {
    tally = `<p class="muted small">Vote final : ${Object.entries(res.counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${nameOf(state, id)} ${n}`)
      .join(' · ')}</p>`;
  }
  const mine = me && res.points ? res.points[me] || 0 : null;
  const myLine = me && R.ids.includes(me) ? `<p class="mine ${mine ? 'win' : ''}">${mine ? `🎉 Tu gagnes ${mine} point${mine > 1 ? 's' : ''} !` : 'Pas de point pour toi cette fois.'}</p>` : '';
  return `<div class="result ${res.spiesWin ? 'spywin' : 'civwin'}">
    <div class="res-icon">${o.icon}</div><h2 class="res-title">${esc(o.title)}</h2><p class="res-sub">${esc(o.sub)}</p>
    ${myLine}
    <div class="reveal-place"><span class="cemoji">${esc(place?.emoji || '❔')}</span><div><small>Le lieu secret</small><b>${esc(place?.name || '?')}</b></div></div>
    <p>${res.spies.length > 1 ? 'Les espions' : 'L’espion'} : ${spies}</p>
    ${tally}${roles}
    ${pts ? `<ul class="list pts">${pts}</ul>` : ''}</div>`;
}

/** Texte de la phase pour la TV et le bandeau du maître du jeu. */
export function phaseLabel(state) {
  const R = state.round;
  if (state.podium) return '🏁 Fin de partie';
  if (!R) return 'En attente des joueurs';
  switch (R.phase) {
    case 'deal':
      return `Manche ${R.n} · chacun découvre sa carte`;
    case 'play':
      return R.paused ? `Manche ${R.n} · ⏸ pause` : `Manche ${R.n} · questions !`;
    case 'accuse':
      return `Manche ${R.n} · accusation !`;
    case 'final':
      return `Manche ${R.n} · temps écoulé, qui est l’espion ?`;
    case 'reveal':
      return `Manche ${R.n} · révélation`;
  }
  return '';
}

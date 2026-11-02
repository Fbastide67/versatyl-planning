// Point d'entrée : chargement, connexion, navigation, mises à jour en direct
import { ctx } from './ctx.js';
import { createStore } from './store.js';
import { $, $$, esc, avatar, debounce } from './util.js';
import { icon } from './icons.js';
import { toast, spikeLoader, skeletonRows } from './ui.js';
import { applyTheme, setTheme, isDark } from './theme.js';
import { registerServiceWorker, systemNotify, pushSupport, enablePush, syncPush, disablePush, needsHomeScreen } from './notify.js';
import { notificationText } from './messages.js';
import { relative, fmtTime, DAY } from './dates.js';
import { KINDS, evStart, evEnd, evColor, isMine, byStart, urgency } from './events.js';
import { renderAuth } from './views/auth.js';
import { teamPlanning, comPlanning } from './views/planning.js';
import * as deadlines from './views/deadlines.js';
import * as team from './views/team.js';
import * as profile from './views/profile.js';
import { openEventDetail, openEventForm } from './views/event-modal.js';

const ROUTES = { planning: teamPlanning, com: comPlanning, deadlines, equipe: team, profil: profile };
const NAV = [['planning', 'calendar', 'Planning'], ['com', 'megaphone', 'Plan de com'], ['deadlines', 'flag', 'Deadlines'], ['equipe', 'users', 'Équipe'], ['profil', 'user', 'Profil']];
const TOKEN_KEY = 'vp_token';
const bootStart = performance.now();
const root = $('#root');
const seen = new Set();
let stopLive = () => {};

applyTheme();
registerServiceWorker();

// Pas de zoom sur mobile : iOS ignore « user-scalable=no », on bloque donc le pincement à la main
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

const storage = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* navigation privée */ } },
};

function parseHash() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  return { route: ROUTES[path] ? path : 'planning', params: new URLSearchParams(query || '') };
}

// ---------- Écran de démarrage ----------

async function hideSplash() {
  const splash = $('#splash');
  if (!splash) return;
  // Animation complète à la première ouverture, plus courte ensuite dans la même session
  let seenSplash = false;
  try { seenSplash = !!sessionStorage.getItem('vp_splash'); sessionStorage.setItem('vp_splash', '1'); } catch { /* navigation privée */ }
  await new Promise(r => setTimeout(r, Math.max(0, (seenSplash ? 700 : 1800) - (performance.now() - bootStart))));
  splash.classList.add('is-leaving');
  setTimeout(() => splash.remove(), 900);
}

function splashError(message) {
  const status = $('#splash .splash-status');
  if (!status) return;
  status.innerHTML = `<p class="splash-error">${esc(message)}</p><button class="btn btn-primary" onclick="location.reload()">Réessayer</button>`;
}

// ---------- Données ----------

async function fetchAll() {
  const [employees, events, notifications] = await Promise.all([
    ctx.store.listEmployees(),
    ctx.store.listEvents(ctx.token),
    ctx.store.listNotifications(ctx.token, ctx.state.me.id),
  ]);
  return { employees, events, notifications };
}

let inflight = null;
let pending = false;
// Signature des dernières données affichées : on ne redessine que si quelque chose a changé
let lastSig = '';
let lastDraw = 0;
async function refresh() {
  if (!ctx.state.me) return;
  if (inflight) { pending = true; return inflight; }
  inflight = (async () => {
    try {
      const data = await fetchAll();
      if (!ctx.state.me) return;
      const me = data.employees.find(e => e.id === ctx.state.me.id);
      if (!me) {
        toast('Ton compte a été supprimé.', { type: 'error' });
        return logout(true);
      }
      Object.assign(ctx.state, data, { me });
      announce(data.notifications);
      const sig = JSON.stringify(data);
      // Sans changement, on redessine quand même de temps en temps (comptes à rebours, retards)
      if (sig === lastSig && Date.now() - lastDraw < 120000) return;
      lastSig = sig;
      rerender();
    } catch (err) {
      console.warn('Actualisation impossible', err);
    }
  })();
  await inflight;
  inflight = null;
  if (pending) { pending = false; return refresh(); }
}

// Nouvelles notifications : toast + notification système si l'onglet est en arrière-plan
function announce(list) {
  const fresh = list.filter(n => !seen.has(n.id));
  fresh.forEach(n => seen.add(n.id));
  const unread = fresh.filter(n => !n.read);
  if (!unread.length) return;
  const bell = $('[data-bell]');
  if (bell) { bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring'); }
  unread.slice(0, 3).forEach(n => {
    const t = notificationText(n);
    toast(t.body, { title: t.title, iconName: t.icon, timeout: 8000 });
  });
  if (document.hidden) unread.forEach(systemNotify);
}

async function run(fn, { success } = {}) {
  try {
    const data = await fn();
    if (success) toast(success, { type: 'success' });
    refresh();
    return { data };
  } catch (err) {
    const msg = err?.message || 'Une erreur est survenue.';
    toast(msg, { type: 'error', title: 'Oups' });
    if (/Session expirée/.test(msg)) logout(true);
    return null;
  }
}

function startLive() {
  const timers = [];
  const unsub = ctx.store.subscribe(debounce(() => refresh(), 250));
  const remind = () => ctx.store.queueReminders().catch(() => {});
  remind();
  timers.push(setInterval(remind, 60000));
  timers.push(setInterval(() => { if (!document.hidden) refresh(); }, ctx.store.mode === 'supabase' ? 30000 : 60000));
  const onVisible = () => { if (!document.hidden) { remind(); refresh(); } };
  document.addEventListener('visibilitychange', onVisible);
  stopLive = () => {
    timers.forEach(clearInterval);
    unsub?.();
    document.removeEventListener('visibilitychange', onVisible);
    stopLive = () => {};
  };
}

// ---------- Connexion ----------

async function showAuth() {
  const employees = await ctx.store.listEmployees();
  renderAuth(root, {
    firstUser: employees.length === 0,
    onAuthed: async ({ employee, token }) => {
      storage.set(TOKEN_KEY, token);
      ctx.token = token;
      ctx.state.me = employee;
      await welcome(employee);
    },
  });
}

// Transition animée après connexion pendant le chargement du planning
async function welcome(employee) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome';
  overlay.innerHTML = `${spikeLoader('lg')}<h2>Salut ${esc(employee.first_name)} !</h2><p>On prépare ton planning…</p>`;
  document.body.appendChild(overlay);
  const t0 = performance.now();
  try {
    Object.assign(ctx.state, await fetchAll());
    ctx.state.notifications.forEach(n => seen.add(n.id));
    await new Promise(r => setTimeout(r, Math.max(0, 1300 - (performance.now() - t0))));
    showApp();
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
  overlay.classList.add('is-leaving');
  setTimeout(() => overlay.remove(), 700);
}

async function logout(skipServer = false) {
  disablePush(ctx.store);
  if (!skipServer && ctx.token) { try { await ctx.store.logout(ctx.token); } catch { /* déjà déconnecté */ } }
  storage.del(TOKEN_KEY);
  stopLive();
  $$('.overlay').forEach(o => o.remove());
  document.body.classList.remove('has-overlay');
  Object.assign(ctx.state, { me: null, employees: [], events: [], notifications: [] });
  ctx.token = null;
  seen.clear();
  await showAuth();
}

// ---------- Interface principale ----------

function navLinks(cls) {
  return NAV.map(([r, ic, label]) => `<a href="#/${r}" data-route="${r}" class="${cls}">${icon(ic)}<span>${label}</span>${r === 'deadlines' ? '<b class="nav-badge" data-late hidden></b>' : ''}</a>`).join('');
}

function showApp() {
  const local = ctx.store.mode === 'local';
  root.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/planning" aria-label="Versatyl Planning"><span class="brand-logo"></span><span class="brand-sub">Planning</span></a>
      <button class="btn btn-create" data-create>${icon('plus')}<span>Ajouter</span></button>
      <nav class="nav">${navLinks('nav-link')}</nav>
      <div class="sidebar-foot">
        <img class="sidebar-mascot" src="assets/mascotte.png" alt="">
        ${local ? '<span class="mode-pill" title="Les données restent dans ce navigateur">Mode démo</span>' : ''}
        <div class="me-row">
          <a class="me-chip" href="#/profil" data-me></a>
          <button class="icon-btn" data-logout title="Se déconnecter" aria-label="Se déconnecter">${icon('logout')}</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="topbar-brand" href="#/planning" aria-label="Accueil"><img src="assets/icon-192.png" alt=""></a>
        <h1 id="page-title"></h1>
        <div class="topbar-actions">
          <button class="icon-btn" data-theme-toggle aria-label="Changer de thème"></button>
          <div class="bell-wrap">
            <button class="icon-btn bell" data-bell aria-label="Notifications">${icon('bell')}<span class="bell-badge" hidden></span></button>
          </div>
          <a class="topbar-me" href="#/profil" data-me-avatar aria-label="Mon profil"></a>
        </div>
      </header>
      ${local && !sessionStorage.getItem('vp_banner') ? `<div class="demo-banner">${icon('alert')}<span><b>Mode démo</b> — les comptes et le planning restent dans ce navigateur. Branche Supabase (voir le README) pour partager le planning avec toute l'équipe.</span><button class="icon-btn icon-btn-xs" data-banner-close aria-label="Masquer">${icon('x')}</button></div>` : ''}
      <div class="push-banner" data-push-banner hidden></div>
      <main id="view" class="view"><div class="view-loading">${skeletonRows(6)}</div></main>
    </div>
    <nav class="tabbar">
      ${navLinks('tab-link').replace('<a href="#/equipe"', `<button class="tab-create" data-create aria-label="Ajouter">${icon('plus')}</button><a href="#/equipe"`)}
    </nav>
  </div>`;

  startLive();
  rerender({ animate: true });
  openFromHash();
  syncPush(ctx.store, ctx.token);
}

// Invite chacun à activer les notifications sur son téléphone (principal canal des rappels)
function updatePushBanner() {
  const el = $('[data-push-banner]');
  if (!el) return;
  let later = false;
  try { later = !!sessionStorage.getItem('vp_push_later'); } catch { /* navigation privée */ }
  const close = `<button class="icon-btn icon-btn-xs" data-push-later aria-label="Plus tard">${icon('x')}</button>`;
  let html = '';
  if (later) html = '';
  else if (needsHomeScreen()) {
    html = `${icon('smartphone')}<span><b>Pour être prévenu·e de tes deadlines sur iPhone</b> : touche <b>Partager</b> puis <b>« Sur l'écran d'accueil »</b>, et ouvre Versatyl depuis la nouvelle icône.</span>${close}`;
  } else if (pushSupport() === 'default') {
    html = `${icon('bell')}<span><b>Active les notifications</b> pour être prévenu·e sur cet appareil quand une deadline approche.</span>
      <button class="btn btn-primary btn-sm" data-push-enable>Activer</button>${close}`;
  }
  el.innerHTML = html;
  el.hidden = !html;
}

async function onPushEnable(btn) {
  btn.disabled = true;
  try {
    await enablePush(ctx.store, ctx.token);
    toast('Notifications activées : tu seras prévenu·e de tes deadlines.', { type: 'success' });
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
  updatePushBanner();
  if (parseHash().route === 'profil') rerender();
}

function onShellClick(e) {
  if (e.target.closest('[data-create]')) {
    const { route } = parseHash();
    if (route === 'com') return openEventForm({ calendar: 'com', kind: 'post' });
    return openEventForm({ kind: route === 'deadlines' ? 'deadline' : 'event' });
  }
  if (e.target.closest('[data-logout]')) return logout();
  if (e.target.closest('[data-theme-toggle]')) { setTheme(isDark() ? 'light' : 'dark'); return rerender(); }
  if (e.target.closest('[data-bell]')) return toggleBell();
  if (e.target.closest('[data-banner-close]')) {
    sessionStorage.setItem('vp_banner', '1');
    return e.target.closest('.demo-banner').remove();
  }
  const pe = e.target.closest('[data-push-enable]');
  if (pe) return onPushEnable(pe);
  if (e.target.closest('[data-push-later]')) {
    try { sessionStorage.setItem('vp_push_later', '1'); } catch { /* navigation privée */ }
    return updatePushBanner();
  }
}

function updateChrome(route) {
  const { me, events } = ctx.state;
  $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  const meChip = $('[data-me]');
  if (meChip) meChip.innerHTML = `${avatar(me)}<span><b>${esc(me.first_name)}</b><small>${esc(me.role)}</small></span>`;
  const meAv = $('[data-me-avatar]');
  if (meAv) meAv.innerHTML = avatar(me, 'sm');
  const tt = $('[data-theme-toggle]');
  if (tt) tt.innerHTML = icon(isDark() ? 'sun' : 'moon');

  const late = events.filter(ev => ev.kind !== 'event' && isMine(ev, me.id) && urgency(ev) === 'late').length;
  $$('[data-late]').forEach(b => { b.hidden = !late; b.textContent = late; });
  const unread = ctx.state.notifications.filter(n => !n.read).length;
  const badge = $('.bell-badge');
  if (badge) { badge.hidden = !unread; badge.textContent = unread > 9 ? '9+' : unread; }
  const panel = $('.notif-panel');
  if (panel) fillBell(panel);
  updatePushBanner();
}

function rerender({ animate = false, dir = 0 } = {}) {
  const view = $('#view');
  if (!view || !ctx.state.me) return;
  const { route } = parseHash();
  const mod = ROUTES[route];

  // On garde le focus, la sélection et le défilement pendant les actualisations
  const active = document.activeElement;
  const activeId = view.contains(active) ? active.id : '';
  const sel = activeId ? [active.selectionStart, active.selectionEnd] : null;
  const scroller = view.querySelector('.g-scroll');
  const scroll = scroller ? [scroller.scrollLeft, scroller.scrollTop] : null;

  view.innerHTML = mod.render();
  lastDraw = Date.now();
  const el = view.firstElementChild;
  mod.mount?.(el);

  if (activeId) {
    const n = document.getElementById(activeId);
    n?.focus();
    try { n?.setSelectionRange(...sel); } catch { /* champ sans sélection */ }
  }
  if (scroll && !animate) {
    const s2 = view.querySelector('.g-scroll');
    if (s2) [s2.scrollLeft, s2.scrollTop] = scroll;
  }
  if (animate) {
    el.classList.add('is-entering');
    el.style.setProperty('--dir', dir);
    // Retiré une fois toutes les entrées en cascade terminées (pas de coupure en plein mouvement)
    setTimeout(() => el.classList.remove('is-entering'), 1100);
  }
  $('#page-title').textContent = mod.title;
  document.title = `${mod.title} · Versatyl Planning`;
  updateChrome(route);
}

function openFromHash() {
  const { route, params } = parseHash();
  const id = params.get('event');
  if (id) {
    history.replaceState(null, '', `#/${route}`);
    setTimeout(() => openEventDetail(id), 300);
  }
}

// ---------- Cloche de notifications ----------

function fillBell(panel) {
  const { me, events, notifications } = ctx.state;
  const tab = panel.dataset.tab || 'recent';
  const now = Date.now();
  let items;
  if (tab === 'recent') {
    items = notifications.length ? notifications.slice(0, 30).map(n => {
      const t = notificationText(n);
      return `<button type="button" class="notif-item ${n.read ? '' : 'is-unread'}" data-open="${n.event_id || ''}">
        <span class="notif-icon">${icon(t.icon)}</span>
        <span class="notif-text"><b>${esc(t.title)}</b><small>${esc(t.body)}</small><em>${relative(n.created_at)}</em></span></button>`;
    }).join('') : '<p class="notif-empty">Aucune notification pour l’instant.</p>';
  } else {
    const soon = events.filter(ev => !ev.done && isMine(ev, me.id) && evEnd(ev) >= now && evStart(ev) - now < 2 * DAY).sort(byStart);
    items = soon.length ? soon.map(ev => `
      <button type="button" class="notif-item" data-open="${ev.id}" style="--c:${evColor(ev)}">
        <span class="notif-icon notif-icon-ev">${icon(KINDS[ev.kind].icon)}</span>
        <span class="notif-text"><b>${esc(ev.title)}</b><small>${ev.all_day ? 'Journée' : fmtTime(ev.starts_at)} · ${relative(ev.starts_at)}</small></span></button>`).join('')
      : '<p class="notif-empty">Rien dans les 48 prochaines heures.</p>';
  }
  panel.innerHTML = `
    <div class="notif-head"><b>Notifications</b>
      <div class="seg seg-sm">
        <button type="button" data-ntab="recent" class="${tab === 'recent' ? 'on' : ''}">Récentes</button>
        <button type="button" data-ntab="soon" class="${tab === 'soon' ? 'on' : ''}">À venir · 48 h</button>
      </div></div>
    <div class="notif-list">${items}</div>`;
}

function closeBell() {
  const panel = $('.notif-panel');
  if (!panel) return;
  panel.classList.add('is-leaving');
  setTimeout(() => panel.remove(), 180);
  document.removeEventListener('mousedown', outsideBell);
}

function outsideBell(e) {
  if (!e.target.closest('.bell-wrap')) closeBell();
}

function toggleBell() {
  if ($('.notif-panel')) return closeBell();
  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.dataset.tab = 'recent';
  $('.bell-wrap').appendChild(panel);
  fillBell(panel);
  document.addEventListener('mousedown', outsideBell);
  panel.addEventListener('click', e => {
    const t = e.target.closest('[data-ntab]');
    if (t) { panel.dataset.tab = t.dataset.ntab; return fillBell(panel); }
    const o = e.target.closest('[data-open]');
    if (o) {
      closeBell();
      if (o.dataset.open) openEventDetail(o.dataset.open);
    }
  });
  const unread = ctx.state.notifications.filter(n => !n.read).map(n => n.id);
  if (unread.length) {
    ctx.store.markRead(ctx.token, unread).then(() => {
      // Les pastilles « non lu » restent visibles le temps de lire le panneau
      setTimeout(() => {
        ctx.state.notifications.forEach(n => { if (unread.includes(n.id)) n.read = true; });
        updateChrome(parseHash().route);
      }, 2500);
    }).catch(() => {});
  }
}

// ---------- Démarrage ----------

Object.assign(ctx, { refresh, rerender, run, logout });
root.addEventListener('click', e => { if (ctx.state.me) onShellClick(e); });

window.addEventListener('hashchange', () => {
  if (!ctx.state.me) return;
  closeBell();
  rerender({ animate: true });
  openFromHash();
  window.scrollTo({ top: 0 });
});

(async function start() {
  try {
    ctx.store = await createStore();
    const token = storage.get(TOKEN_KEY);
    const me = token ? await ctx.store.session(token) : null;
    if (me) {
      ctx.token = token;
      ctx.state.me = me;
      Object.assign(ctx.state, await fetchAll());
      ctx.state.notifications.forEach(n => seen.add(n.id));
      showApp();
    } else {
      if (token) storage.del(TOKEN_KEY);
      await showAuth();
    }
    hideSplash();
  } catch (err) {
    console.error(err);
    splashError(err.message || 'Impossible de charger le planning.');
  }
})();

// Plannings façon Skello, une colonne par jour :
// - planning d'équipe : une ligne par personne
// - plan de com : une ligne par canal (Instagram, newsletter…)
import { CONFIG } from '../config.js';
import { ctx } from '../ctx.js';
import { esc, avatar, fullName, colorFor, plural, rolesOf, mainRole } from '../util.js';
import { icon } from '../icons.js';
import {
  startOfDay, startOfWeek, startOfMonth, addDays, addMonths, dayKey, parseDayKey, sameDay,
  isoWeek, fmtTime, fmtWeekday, fmtDateShort, fmtDate, fmtMonth,
} from '../dates.js';
import { KINDS, CALENDARS, evColor, evStart, evEnd, evCalendar, occursOn, rowsFor, isMine, urgency, byStart } from '../events.js';
import { openEventDetail, openEventForm } from './event-modal.js';

const VIEWS = { day: 'Jour', week: 'Semaine', month: 'Mois' };

function visibleDays(p) {
  if (p.view === 'day') return [startOfDay(p.anchor)];
  if (p.view === 'week') {
    const s = startOfWeek(p.anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }
  const first = startOfMonth(p.anchor);
  const s = startOfWeek(first);
  const e = addDays(startOfWeek(addDays(addMonths(first, 1), -1)), 6);
  const n = Math.round((e - s) / 86400000) + 1;
  return Array.from({ length: n }, (_, i) => addDays(s, i));
}

function heading(p, days) {
  if (p.view === 'day') {
    const t = fmtDate(days[0]);
    return `${t.charAt(0).toUpperCase() + t.slice(1)} ${days[0].getFullYear()}`;
  }
  if (p.view === 'month') return fmtMonth(p.anchor);
  const [a, b] = [days[0], days[6]];
  const range = a.getMonth() === b.getMonth() ? `${a.getDate()} – ${fmtDateShort(b)}` : `${fmtDateShort(a)} – ${fmtDateShort(b)}`;
  return `<span class="week-num">S${isoWeek(a)}</span> ${range} ${b.getFullYear()}`;
}

// ---------- Planning d'équipe : lignes = personnes ----------

const TEAM = {
  calendar: 'team',
  title: 'Planning',
  state: () => ctx.state.planning,
  rows() {
    const { me, employees, planning: p } = ctx.state;
    const emps = employees
      .filter(e => (!p.role || rolesOf(e).includes(p.role)) && (!p.mine || e.id === me.id))
      .sort((a, b) => (b.id === me.id) - (a.id === me.id) || a.first_name.localeCompare(b.first_name));
    return [
      { id: 'team', cls: ' is-team', label: n => `<span class="team-dot">${icon('users')}</span>
        <div class="g-who"><b>Toute l'équipe</b><small>Événements communs</small></div><span class="g-count">${n}</span>` },
      ...emps.map(e => ({
        id: e.id, cls: '',
        label: n => `${avatar(e)}
          <div class="g-who"><b>${esc(fullName(e))}${e.id === me.id ? ' <em>· moi</em>' : ''}</b>
          <small><i class="dot" style="--c:${colorFor(mainRole(e))}"></i>${esc(rolesOf(e).join(' · '))}</small></div>
          <span class="g-count" title="Éléments sur la période">${n}</span>`,
      })),
    ];
  },
  rowsOf: rowsFor,
  countLabel: rows => plural(rows.length - 1, 'personne'),
  matches(ev) {
    const { me, planning: p } = ctx.state;
    if (p.mine && !isMine(ev, me.id)) return false;
    if (p.role && !ev.everyone && !rowsFor(ev).some(id => rolesOf(ctx.emp(id)).includes(p.role))) return false;
    return true;
  },
  cellInit(rowId) {
    const team = rowId === 'team';
    return { everyone: team, participants: team ? [] : [rowId] };
  },
  filters(p) {
    const roles = [...new Set(ctx.state.employees.flatMap(rolesOf))].sort();
    return `<select class="input input-sm" data-filter="role" aria-label="Filtrer par poste">
        <option value="">Tous les postes</option>
        ${roles.map(r => `<option ${r === p.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}
      </select>`;
  },
  onFilter(p, name, value) { if (name === 'role') p.role = value; },
  empty: 'Personne ne correspond à ce filtre.',
};

// ---------- Plan de com : lignes = canaux ----------

const GENERAL = 'general';
const channelsOf = ev => (ev.channels?.length ? ev.channels : [GENERAL]);

const COM = {
  calendar: 'com',
  title: 'Plan de com',
  state: () => ctx.state.com,
  rows() {
    const p = ctx.state.com;
    const used = ctx.state.events.filter(ev => evCalendar(ev) === 'com').flatMap(ev => ev.channels || []);
    const all = [...new Set([...CONFIG.channels, ...used])].filter(c => !p.channel || c === p.channel);
    return [
      ...(p.channel ? [] : [{ id: GENERAL, cls: ' is-team', label: n => `<span class="team-dot">${icon('megaphone')}</span>
        <div class="g-who"><b>Général</b><small>Campagnes, temps forts</small></div><span class="g-count">${n}</span>` }]),
      ...all.map(c => ({
        id: c, cls: '',
        label: n => `<span class="channel-dot" style="--c:${colorFor(c)}">${esc(c.slice(0, 2))}</span>
          <div class="g-who"><b>${esc(c)}</b><small>${plural(n, 'élément')}</small></div>`,
      })),
    ];
  },
  rowsOf: channelsOf,
  countLabel: rows => plural(rows.filter(r => r.id !== GENERAL).length, 'canal', 'canaux'),
  matches(ev) {
    const { me, com: p } = ctx.state;
    if (p.mine && !isMine(ev, me.id)) return false;
    if (p.channel && !channelsOf(ev).includes(p.channel)) return false;
    return true;
  },
  cellInit(rowId) {
    return { calendar: 'com', kind: 'post', channels: rowId === GENERAL ? [] : [rowId] };
  },
  filters(p) {
    const used = ctx.state.events.filter(ev => evCalendar(ev) === 'com').flatMap(ev => ev.channels || []);
    const all = [...new Set([...CONFIG.channels, ...used])];
    return `<select class="input input-sm" data-filter="channel" aria-label="Filtrer par canal">
        <option value="">Tous les canaux</option>
        ${all.map(c => `<option ${c === p.channel ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>`;
  },
  onFilter(p, name, value) { if (name === 'channel') p.channel = value; },
  empty: 'Aucun canal ne correspond à ce filtre.',
};

// ---------- Rendu commun ----------

function cardTime(ev, day) {
  const s = evStart(ev);
  const e = evEnd(ev);
  if (ev.all_day) return 'Journée';
  if (ev.kind !== 'event') return fmtTime(s);
  if (!sameDay(s, e)) return sameDay(s, day) ? `${fmtTime(s)} →` : sameDay(e, day) ? `→ ${fmtTime(e)}` : 'Journée';
  return ev.ends_at ? `${fmtTime(s)} – ${fmtTime(e)}` : fmtTime(s);
}

const lock = ev => (ev.is_private ? `<span class="ev-lock" title="Privé">${icon('lock')}</span>` : '');

function card(ev, day, i) {
  const k = ev.kind;
  return `<button type="button" class="ev ev-${k} u-${urgency(ev)}${ev.done ? ' is-done' : ''}" style="--c:${evColor(ev)};--i:${i}" data-ev="${ev.id}">
    <span class="ev-time">${k !== 'event' ? icon(KINDS[k].icon) : ''}${cardTime(ev, day)}${lock(ev)}</span>
    <span class="ev-title">${esc(ev.title)}</span>
  </button>`;
}

const inCalendar = cfg => ctx.state.events.filter(ev => evCalendar(ev) === cfg.calendar);

function renderGrid(cfg, days) {
  const rows = cfg.rows();
  const first = days[0];
  const last = days.at(-1);
  const today = dayKey(new Date());

  // Index : ligne|jour -> éléments
  const idx = new Map();
  const counts = new Map();
  for (const ev of inCalendar(cfg)) {
    if (startOfDay(evEnd(ev)) < first || startOfDay(evStart(ev)) > last) continue;
    for (const r of cfg.rowsOf(ev)) {
      let seen = false;
      for (const d of days) {
        if (!occursOn(ev, d)) continue;
        const k = `${r}|${dayKey(d)}`;
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push(ev);
        seen = true;
      }
      if (seen) counts.set(r, (counts.get(r) || 0) + 1);
    }
  }
  for (const list of idx.values()) list.sort((a, b) => (b.all_day - a.all_day) || byStart(a, b));

  let n = 0;
  const cls = d => `${dayKey(d) === today ? ' is-today' : ''}${[0, 6].includes(d.getDay()) ? ' is-weekend' : ''}`;
  const row = r => `
    <div class="g-name${r.cls}">${r.label(counts.get(r.id) || 0)}</div>
    ${days.map(d => {
      const k = dayKey(d);
      const list = idx.get(`${r.id}|${k}`) || [];
      return `<div class="g-cell${cls(d)}${r.cls}" data-day="${k}" data-row="${esc(r.id)}">${list.map(ev => card(ev, d, n++)).join('')}
        <span class="cell-add" aria-hidden="true">${icon('plus')}</span></div>`;
    }).join('')}`;

  const head = `<div class="g-corner">${cfg.countLabel(rows)}</div>` +
    days.map(d => `<div class="g-head${cls(d)}"><span>${fmtWeekday(d)}</span><b>${d.getDate()}</b></div>`).join('');

  return `<div class="g-scroll">
    <div class="grid" style="--cols:${days.length}" data-mode="${cfg.state().view}">
      ${head}
      ${rows.map(row).join('')}
    </div>
  </div>
  ${rows.some(r => !r.cls) ? '' : `<p class="muted center pad">${cfg.empty}</p>`}`;
}

function renderMonth(cfg, days) {
  const month = cfg.state().anchor.getMonth();
  const today = dayKey(new Date());
  const events = inCalendar(cfg).filter(cfg.matches);
  const names = days.slice(0, 7).map(d => `<div class="m-head">${fmtWeekday(d)}</div>`).join('');
  let n = 0;
  const cells = days.map(d => {
    const k = dayKey(d);
    const list = events.filter(ev => occursOn(ev, d)).sort((a, b) => (b.all_day - a.all_day) || byStart(a, b));
    const chips = list.slice(0, 3).map(ev => `
      <button type="button" class="m-ev ev-${ev.kind} u-${urgency(ev)}${ev.done ? ' is-done' : ''}" style="--c:${evColor(ev)};--i:${n++}" data-ev="${ev.id}">
        ${ev.kind !== 'event' ? icon(KINDS[ev.kind].icon) : ''}<b>${ev.all_day ? '' : fmtTime(ev.starts_at)}</b> ${esc(ev.title)}</button>`).join('');
    return `<div class="m-cell${d.getMonth() !== month ? ' is-out' : ''}${k === today ? ' is-today' : ''}" data-day="${k}">
      <span class="m-num">${d.getDate()}</span>${chips}
      ${list.length > 3 ? `<button type="button" class="m-more" data-goto="${k}">+ ${list.length - 3} autre${list.length > 4 ? 's' : ''}</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="month"><div class="m-names">${names}</div><div class="m-grid">${cells}</div></div>`;
}

function render(cfg) {
  const p = cfg.state();
  const days = visibleDays(p);
  const kinds = CALENDARS[cfg.calendar].kinds;
  return `<div class="planning planning-${cfg.calendar}">
    <div class="toolbar">
      <div class="tb-group">
        <div class="tb-nav">
          <button class="icon-btn" data-nav="-1" aria-label="Précédent">${icon('chevL')}</button>
          <button class="icon-btn" data-nav="1" aria-label="Suivant">${icon('chevR')}</button>
        </div>
        <button class="btn btn-ghost btn-sm" data-nav="0">Aujourd'hui</button>
        <h2 class="tb-title">${heading(p, days)}</h2>
      </div>
      <div class="tb-group tb-filters">
        <div class="seg" role="tablist" aria-label="Affichage">
          ${Object.entries(VIEWS).map(([v, l]) => `<button type="button" class="${p.view === v ? 'on' : ''}" data-view="${v}">${l}</button>`).join('')}
        </div>
        ${cfg.filters(p)}
        <label class="switch"><input type="checkbox" data-filter="mine" ${p.mine ? 'checked' : ''}><span></span>Moi seulement</label>
        <button class="btn btn-primary tb-create" data-create>${icon('plus')}<span>Ajouter</span></button>
      </div>
    </div>
    <div class="legend">
      ${kinds.map(k => `<span><i ${k === 'deadline' ? 'class="is-striped"' : ''} style="--c:${KINDS[k].color}"></i>${KINDS[k].label}</span>`).join('')}
      <span><i class="is-late"></i>En retard</span>
      <span>${icon('lock')} Privé</span>
      <span class="legend-tip">${icon('sparkle')} Clique sur une case pour ajouter un élément</span>
    </div>
    <div class="planning-body">${p.view === 'month' ? renderMonth(cfg, days) : renderGrid(cfg, days)}</div>
  </div>`;
}

function move(cfg, dir) {
  const p = cfg.state();
  if (dir === 0) p.anchor = new Date();
  else if (p.view === 'day') p.anchor = addDays(p.anchor, dir);
  else if (p.view === 'week') p.anchor = addDays(p.anchor, 7 * dir);
  else p.anchor = addMonths(p.anchor, dir);
  ctx.rerender({ animate: true, dir });
}

function mount(cfg, el) {
  const p = cfg.state();
  const base = cfg.calendar === 'com' ? { calendar: 'com', kind: 'post' } : {};
  el.addEventListener('click', e => {
    const evb = e.target.closest('[data-ev]');
    if (evb) return openEventDetail(evb.dataset.ev);
    const nav = e.target.closest('[data-nav]');
    if (nav) return move(cfg, +nav.dataset.nav);
    const v = e.target.closest('[data-view]');
    if (v && v.tagName === 'BUTTON') { p.view = v.dataset.view; return ctx.rerender({ animate: true }); }
    if (e.target.closest('[data-create]')) return openEventForm(base);
    const go = e.target.closest('[data-goto]');
    if (go) { p.anchor = parseDayKey(go.dataset.goto); p.view = 'day'; return ctx.rerender({ animate: true }); }
    const cell = e.target.closest('.g-cell');
    if (cell) return openEventForm({ day: parseDayKey(cell.dataset.day), ...cfg.cellInit(cell.dataset.row) });
    const mc = e.target.closest('.m-cell');
    if (mc) return openEventForm({ ...base, day: parseDayKey(mc.dataset.day) });
  });
  el.addEventListener('change', e => {
    const f = e.target.dataset.filter;
    if (!f) return;
    if (f === 'mine') p.mine = e.target.checked;
    else cfg.onFilter(p, f, e.target.value);
    ctx.rerender({ animate: true });
  });
}

const view = cfg => ({ title: cfg.title, render: () => render(cfg), mount: el => mount(cfg, el) });
export const teamPlanning = view(TEAM);
export const comPlanning = view(COM);

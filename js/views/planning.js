// Planning façon Skello : une ligne par personne, une colonne par jour
import { ctx } from '../ctx.js';
import { esc, avatar, fullName, colorFor, plural } from '../util.js';
import { icon } from '../icons.js';
import {
  startOfDay, startOfWeek, startOfMonth, addDays, addMonths, dayKey, parseDayKey, sameDay,
  isoWeek, fmtTime, fmtWeekday, fmtDateShort, fmtDate, fmtMonth,
} from '../dates.js';
import { KINDS, evColor, evStart, evEnd, occursOn, rowsFor, isMine, urgency, byStart } from '../events.js';
import { openEventDetail, openEventForm } from './event-modal.js';

export const title = 'Planning';
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

function visibleEmployees() {
  const { me, employees, planning: p } = ctx.state;
  return employees
    .filter(e => (!p.role || e.role === p.role) && (!p.mine || e.id === me.id))
    .sort((a, b) => (b.id === me.id) - (a.id === me.id) || a.first_name.localeCompare(b.first_name));
}

function eventVisible(ev) {
  const { me, planning: p } = ctx.state;
  if (p.mine && !isMine(ev, me.id)) return false;
  if (p.role && !ev.everyone && !rowsFor(ev).some(id => ctx.emp(id)?.role === p.role)) return false;
  return true;
}

function cardTime(ev, day) {
  const s = evStart(ev);
  const e = evEnd(ev);
  if (ev.all_day) return 'Journée';
  if (ev.kind !== 'event') return fmtTime(s);
  if (!sameDay(s, e)) return sameDay(s, day) ? `${fmtTime(s)} →` : sameDay(e, day) ? `→ ${fmtTime(e)}` : 'Journée';
  return ev.ends_at ? `${fmtTime(s)} – ${fmtTime(e)}` : fmtTime(s);
}

function card(ev, day, i) {
  const k = ev.kind;
  return `<button type="button" class="ev ev-${k} u-${urgency(ev)}${ev.done ? ' is-done' : ''}" style="--c:${evColor(ev)};--i:${Math.min(i, 30)}" data-ev="${ev.id}">
    <span class="ev-time">${k !== 'event' ? icon(KINDS[k].icon) : ''}${cardTime(ev, day)}</span>
    <span class="ev-title">${esc(ev.title)}</span>
  </button>`;
}

function renderGrid(days) {
  const { me, events } = ctx.state;
  const emps = visibleEmployees();
  const first = days[0];
  const last = days.at(-1);
  const today = dayKey(new Date());

  // Index : ligne|jour -> événements
  const idx = new Map();
  const counts = new Map();
  for (const ev of events) {
    if (startOfDay(evEnd(ev)) < first || startOfDay(evStart(ev)) > last) continue;
    for (const r of rowsFor(ev)) {
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
  const row = (id, label, extra = '') => `
    <div class="g-name${extra}">${label}</div>
    ${days.map(d => {
      const k = dayKey(d);
      const list = idx.get(`${id}|${k}`) || [];
      return `<div class="g-cell${cls(d)}${extra}" data-day="${k}" data-row="${id}">${list.map(ev => card(ev, d, n++)).join('')}
        <span class="cell-add" aria-hidden="true">${icon('plus')}</span></div>`;
    }).join('')}`;

  const head = `<div class="g-corner">${plural(emps.length, 'personne')}</div>` +
    days.map(d => `<div class="g-head${cls(d)}"><span>${fmtWeekday(d)}</span><b>${d.getDate()}</b></div>`).join('');

  const teamLabel = `<span class="team-dot">${icon('users')}</span>
    <div class="g-who"><b>Toute l'équipe</b><small>Événements communs</small></div>
    <span class="g-count">${counts.get('team') || 0}</span>`;

  const empLabel = e => `${avatar(e)}
    <div class="g-who"><b>${esc(fullName(e))}${e.id === me.id ? ' <em>· moi</em>' : ''}</b>
    <small><i class="dot" style="--c:${colorFor(e.role)}"></i>${esc(e.role)}</small></div>
    <span class="g-count" title="Éléments sur la période">${counts.get(e.id) || 0}</span>`;

  return `<div class="g-scroll">
    <div class="grid" style="--cols:${days.length}" data-mode="${ctx.state.planning.view}">
      ${head}
      ${row('team', teamLabel, ' is-team')}
      ${emps.map(e => row(e.id, empLabel(e))).join('')}
    </div>
  </div>
  ${emps.length ? '' : '<p class="muted center pad">Personne ne correspond à ce filtre.</p>'}`;
}

function renderMonth(days) {
  const month = ctx.state.planning.anchor.getMonth();
  const today = dayKey(new Date());
  const events = ctx.state.events.filter(eventVisible);
  const names = days.slice(0, 7).map(d => `<div class="m-head">${fmtWeekday(d)}</div>`).join('');
  let n = 0;
  const cells = days.map(d => {
    const k = dayKey(d);
    const list = events.filter(ev => occursOn(ev, d)).sort((a, b) => (b.all_day - a.all_day) || byStart(a, b));
    const chips = list.slice(0, 3).map(ev => `
      <button type="button" class="m-ev ev-${ev.kind} u-${urgency(ev)}${ev.done ? ' is-done' : ''}" style="--c:${evColor(ev)};--i:${Math.min(n++, 40)}" data-ev="${ev.id}">
        ${ev.kind !== 'event' ? icon(KINDS[ev.kind].icon) : ''}<b>${ev.all_day ? '' : fmtTime(ev.starts_at)}</b> ${esc(ev.title)}</button>`).join('');
    return `<div class="m-cell${d.getMonth() !== month ? ' is-out' : ''}${k === today ? ' is-today' : ''}" data-day="${k}">
      <span class="m-num">${d.getDate()}</span>${chips}
      ${list.length > 3 ? `<button type="button" class="m-more" data-goto="${k}">+ ${list.length - 3} autre${list.length > 4 ? 's' : ''}</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="month"><div class="m-names">${names}</div><div class="m-grid">${cells}</div></div>`;
}

export function render() {
  const { employees, planning: p } = ctx.state;
  const days = visibleDays(p);
  const roles = [...new Set(employees.map(e => e.role))].sort();
  return `<div class="planning">
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
        <select class="input input-sm" data-filter="role" aria-label="Filtrer par poste">
          <option value="">Tous les postes</option>
          ${roles.map(r => `<option ${r === p.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}
        </select>
        <label class="switch"><input type="checkbox" data-filter="mine" ${p.mine ? 'checked' : ''}><span></span>Moi seulement</label>
        <button class="btn btn-primary tb-create" data-create>${icon('plus')}<span>Ajouter</span></button>
      </div>
    </div>
    <div class="legend">
      <span><i style="--c:${KINDS.event.color}"></i>Événement</span>
      <span><i style="--c:${KINDS.task.color}"></i>Tâche</span>
      <span><i class="is-striped" style="--c:${KINDS.deadline.color}"></i>Deadline</span>
      <span><i class="is-late"></i>En retard</span>
      <span class="legend-tip">${icon('sparkle')} Clique sur une case pour ajouter un élément</span>
    </div>
    <div class="planning-body">${p.view === 'month' ? renderMonth(days) : renderGrid(days)}</div>
  </div>`;
}

function move(dir) {
  const p = ctx.state.planning;
  if (dir === 0) p.anchor = new Date();
  else if (p.view === 'day') p.anchor = addDays(p.anchor, dir);
  else if (p.view === 'week') p.anchor = addDays(p.anchor, 7 * dir);
  else p.anchor = addMonths(p.anchor, dir);
  ctx.rerender({ animate: true, dir });
}

export function mount(el) {
  const p = ctx.state.planning;
  el.addEventListener('click', e => {
    const evb = e.target.closest('[data-ev]');
    if (evb) return openEventDetail(evb.dataset.ev);
    const nav = e.target.closest('[data-nav]');
    if (nav) return move(+nav.dataset.nav);
    const v = e.target.closest('[data-view]');
    if (v && v.tagName === 'BUTTON') { p.view = v.dataset.view; return ctx.rerender({ animate: true }); }
    if (e.target.closest('[data-create]')) return openEventForm({});
    const go = e.target.closest('[data-goto]');
    if (go) { p.anchor = parseDayKey(go.dataset.goto); p.view = 'day'; return ctx.rerender({ animate: true }); }
    const cell = e.target.closest('.g-cell');
    if (cell) {
      const team = cell.dataset.row === 'team';
      return openEventForm({ day: parseDayKey(cell.dataset.day), everyone: team, participants: team ? [] : [cell.dataset.row] });
    }
    const mc = e.target.closest('.m-cell');
    if (mc) return openEventForm({ day: parseDayKey(mc.dataset.day) });
  });
  el.addEventListener('change', e => {
    const f = e.target.dataset.filter;
    if (f === 'role') p.role = e.target.value;
    if (f === 'mine') p.mine = e.target.checked;
    if (f) ctx.rerender({ animate: true });
  });
}

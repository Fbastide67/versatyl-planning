// Deadlines & tâches : à venir, en retard, terminées
import { ctx } from '../ctx.js';
import { esc, avatar, fullName } from '../util.js';
import { icon } from '../icons.js';
import { burst, emptyState } from '../ui.js';
import { KINDS, evColor, evStart, isMine, canToggle, urgency, involvedIds, byStart } from '../events.js';
import { fmtWhen, relative, countdown, DAY } from '../dates.js';
import { openEventDetail, openEventForm } from './event-modal.js';

export const title = 'Deadlines & tâches';

function groups() {
  const { me, events, deadlines: s } = ctx.state;
  const now = Date.now();
  const scope = events.filter(e => e.kind !== 'event' && (!s.mine || isMine(e, me.id)));
  const open = scope.filter(e => !e.done);
  const upcoming = open.filter(e => evStart(e) >= now).sort(byStart);
  return {
    upcoming,
    late: open.filter(e => evStart(e) < now).sort(byStart),
    soon: upcoming.filter(e => evStart(e) - now < DAY),
    week: upcoming.filter(e => evStart(e) - now < 7 * DAY),
    done: scope.filter(e => e.done).sort((a, b) => evStart(b) - evStart(a)),
  };
}

function item(ev, i) {
  const { me, employees } = ctx.state;
  const u = urgency(ev);
  const can = canToggle(ev, me);
  const created = Date.parse(ev.created_at);
  const due = evStart(ev).getTime();
  const pct = ev.done ? 100 : Math.max(3, Math.min(100, ((Date.now() - created) / Math.max(1, due - created)) * 100));
  const people = ev.everyone ? `<span class="avatar avatar-sm avatar-team" title="Toute l'équipe">${icon('users')}</span>`
    : involvedIds(ev, employees).map(id => ctx.emp(id)).filter(Boolean).slice(0, 4).map(p => avatar(p, 'sm')).join('');
  const extra = ev.everyone ? 0 : involvedIds(ev, employees).length - 4;
  const k = KINDS[ev.kind];
  return `<article class="dl-item u-${u}" style="--c:${evColor(ev)};--i:${Math.min(i, 20)}" data-ev="${ev.id}">
    <button type="button" class="dl-check ${ev.done ? 'on' : ''}" data-toggle="${ev.id}" ${can ? '' : 'disabled'}
      title="${can ? (ev.done ? 'Rouvrir' : 'Marquer comme terminé') : 'Réservé aux personnes concernées'}" aria-label="${ev.done ? 'Rouvrir' : 'Marquer comme terminé'}">${icon('check')}</button>
    <div class="dl-main">
      <div class="dl-top"><span class="kind-mini" style="--c:${k.color}">${icon(k.icon)}${k.label}</span>
        <h3>${esc(ev.title)}</h3></div>
      <div class="dl-meta">${icon('clock')}<span>${esc(fmtWhen(ev))} · ${relative(ev.starts_at)}</span>
        <span class="dl-by">par ${esc(fullName(ctx.emp(ev.created_by)))}</span></div>
      <div class="dl-progress" title="Temps écoulé"><span style="width:${pct}%"></span></div>
    </div>
    <div class="dl-side">
      <span class="countdown u-${u}">${ev.done ? 'Fait' : countdown(ev.starts_at)}</span>
      <div class="avatars">${people}${extra > 0 ? `<span class="avatar avatar-sm avatar-more">+${extra}</span>` : ''}</div>
    </div>
  </article>`;
}

export function render() {
  const s = ctx.state.deadlines;
  const g = groups();
  const stats = [
    ['late', g.late.length, 'En retard', 'alert', 'danger'],
    ['upcoming', g.soon.length, 'Dans les 24 h', 'hourglass', 'warning'],
    ['upcoming', g.week.length, 'Dans les 7 jours', 'calendar', 'primary'],
    ['done', g.done.length, 'Terminées', 'check', 'success'],
  ];
  const tabs = [['upcoming', 'À venir', g.upcoming.length], ['late', 'En retard', g.late.length], ['done', 'Terminées', g.done.length]];
  const list = s.tab === 'late' ? g.late : s.tab === 'done' ? g.done.slice(0, 60) : g.upcoming;
  const empty = {
    upcoming: ['Rien à l’horizon', 'Aucune deadline ni tâche à venir. Profites-en… ou ajoutes-en une !'],
    late: ['Aucun retard', 'Tout est dans les temps, bravo à l’équipe.'],
    done: ['Rien de terminé pour l’instant', 'Coche une deadline quand elle est bouclée.'],
  }[s.tab];

  return `<div class="deadlines">
    <div class="stats">
      ${stats.map(([tab, n, label, ic, tone], i) => `
        <button type="button" class="stat tone-${tone}" data-tab="${tab}" style="--i:${i}">
          <span class="stat-icon">${icon(ic)}</span><b>${n}</b><span>${label}</span></button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="seg" role="tablist">
        ${tabs.map(([t, l, n]) => `<button type="button" class="${s.tab === t ? 'on' : ''}" data-tab="${t}">${l} <em>${n}</em></button>`).join('')}
      </div>
      <div class="tb-group">
        <label class="switch"><input type="checkbox" data-mine ${s.mine ? 'checked' : ''}><span></span>Seulement les miennes</label>
        <button class="btn btn-primary" data-create>${icon('plus')}<span>Nouvelle deadline</span></button>
      </div>
    </div>
    <div class="dl-list">
      ${list.length ? list.map(item).join('') : emptyState(empty[0], empty[1])}
    </div>
  </div>`;
}

export function mount(el) {
  const s = ctx.state.deadlines;
  el.addEventListener('click', async e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const ev = ctx.state.events.find(x => x.id === tg.dataset.toggle);
      if (!ev) return;
      if (!ev.done) { burst(tg, '#16a34a'); tg.classList.add('on'); }
      await ctx.run(() => ctx.store.setDone(ctx.token, ev.id, !ev.done), { success: ev.done ? 'Rouvert.' : 'Bravo, c’est bouclé !' });
      return;
    }
    const t = e.target.closest('[data-tab]');
    if (t) { s.tab = t.dataset.tab; return ctx.rerender({ animate: true }); }
    if (e.target.closest('[data-create]')) return openEventForm({ kind: 'deadline' });
    const it = e.target.closest('[data-ev]');
    if (it) openEventDetail(it.dataset.ev);
  });
  el.querySelector('[data-mine]').addEventListener('change', e => {
    s.mine = e.target.checked;
    ctx.rerender({ animate: true });
  });
}

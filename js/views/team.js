// Registre du personnel : rôles, contacts, fiche de chaque membre
import { CONFIG } from '../config.js';
import { ctx } from '../ctx.js';
import { esc, avatar, fullName, roleBadges, rolesOf, colorFor, download, copyText, plural } from '../util.js';
import { icon } from '../icons.js';
import { openModal, confirmDialog, toast, withBusy, emptyState, rolePicker, bindRolePicker } from '../ui.js';
import { hashPassword } from '../store.js';
import { evEnd, isInvolved, byStart, evColor, KINDS } from '../events.js';
import { fmtDateFull, fmtWhen, relative, dayKey, DAY } from '../dates.js';
import { openEventDetail } from './event-modal.js';

export const title = 'Registre du personnel';

const telHref = p => p.replace(/[^\d+]/g, '');

function filtered() {
  const { employees, team: s } = ctx.state;
  const q = s.q.trim().toLowerCase();
  return employees
    .filter(e => !s.role || rolesOf(e).includes(s.role))
    .filter(e => !q || [fullName(e), e.username, e.role, e.email, e.phone, e.contract].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.first_name.localeCompare(b.first_name));
}

function seniority(date) {
  if (!date) return '';
  const days = Math.floor((Date.now() - new Date(date)) / DAY);
  if (days < 0) return 'arrive bientôt';
  if (days < 31) return plural(days, 'jour');
  if (days < 365) return `${Math.floor(days / 30.4)} mois`;
  return plural(Math.floor(days / 365), 'an');
}

function contactLinks(e) {
  return `${e.email ? `<a class="contact" href="mailto:${esc(e.email)}" data-stop>${icon('mail')}<span>${esc(e.email)}</span></a>` : ''}
    ${e.phone ? `<a class="contact" href="tel:${esc(telHref(e.phone))}" data-stop>${icon('phone')}<span>${esc(e.phone)}</span></a>` : ''}`;
}

function renderList() {
  const { me, team: s } = ctx.state;
  const list = filtered();
  if (!list.length) return emptyState('Personne trouvé', 'Essaie un autre nom, poste ou numéro.');
  if (s.layout === 'cards') {
    return `<div class="people-grid">${list.map((e, i) => `
      <article class="person-card" data-emp="${e.id}" style="--i:${Math.min(i, 20)};--c:${colorFor(e.id)}">
        ${avatar(e, 'lg')}
        <h3>${esc(fullName(e))}${e.id === me.id ? ' <em>· moi</em>' : ''}</h3>
        <div class="role-badges">${roleBadges(e)}</div>
        <div class="person-contacts">${contactLinks(e) || '<span class="muted">Pas de contact renseigné</span>'}</div>
      </article>`).join('')}</div>`;
  }
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Collaborateur</th><th>Poste</th><th>E-mail</th><th>Téléphone</th><th>Contrat</th><th>Arrivée</th></tr></thead>
    <tbody>${list.map((e, i) => `
      <tr data-emp="${e.id}" style="--i:${Math.min(i, 20)}">
        <td><div class="person-cell">${avatar(e)}<div><b>${esc(fullName(e))}${e.id === me.id ? ' <em>· moi</em>' : ''}${e.is_admin ? ` <span class="admin-tag" title="Administrateur">${icon('shield')}</span>` : ''}</b><small>@${esc(e.username)}</small></div></div></td>
        <td><div class="role-badges">${roleBadges(e)}</div></td>
        <td>${e.email ? `<span class="copy-cell"><a href="mailto:${esc(e.email)}" data-stop>${esc(e.email)}</a><button class="icon-btn icon-btn-xs" data-copy="${esc(e.email)}" aria-label="Copier l'e-mail">${icon('copy')}</button></span>` : '<span class="muted">—</span>'}</td>
        <td>${e.phone ? `<span class="copy-cell"><a href="tel:${esc(telHref(e.phone))}" data-stop>${esc(e.phone)}</a><button class="icon-btn icon-btn-xs" data-copy="${esc(e.phone)}" aria-label="Copier le numéro">${icon('copy')}</button></span>` : '<span class="muted">—</span>'}</td>
        <td>${esc(e.contract) || '<span class="muted">—</span>'}</td>
        <td>${e.start_date ? `${fmtDateFull(e.start_date)}<small class="muted block">${seniority(e.start_date)}</small>` : '<span class="muted">—</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

export function render() {
  const { employees, team: s } = ctx.state;
  const counts = {};
  for (const e of employees) for (const r of rolesOf(e)) counts[r] = (counts[r] || 0) + 1;
  const roles = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return `<div class="team">
    <div class="team-summary">
      <div class="summary-card"><b>${employees.length}</b><span>${employees.length > 1 ? 'membres' : 'membre'} dans l'équipe</span></div>
      <div class="role-chips">
        <button type="button" class="role-chip ${s.role ? '' : 'on'}" data-role="">Tous <em>${employees.length}</em></button>
        ${roles.map(([r, n]) => `<button type="button" class="role-chip ${s.role === r ? 'on' : ''}" data-role="${esc(r)}" style="--c:${colorFor(r)}"><i></i>${esc(r)} <em>${n}</em></button>`).join('')}
      </div>
    </div>
    <div class="toolbar">
      <label class="search">${icon('search')}<input id="team-search" type="search" placeholder="Rechercher un nom, un poste, un numéro…" value="${esc(s.q)}" autocomplete="off"></label>
      <div class="tb-group">
        <div class="seg" role="tablist" aria-label="Affichage">
          <button type="button" class="${s.layout === 'table' ? 'on' : ''}" data-layout="table" aria-label="Tableau">${icon('list')}</button>
          <button type="button" class="${s.layout === 'cards' ? 'on' : ''}" data-layout="cards" aria-label="Cartes">${icon('grid')}</button>
        </div>
        <button class="btn btn-ghost" data-export>${icon('download')}<span>Exporter</span></button>
      </div>
    </div>
    <div class="team-list">${renderList()}</div>
  </div>`;
}

function exportCsv() {
  const rows = [['Nom', 'Prénom', 'Identifiant', 'Poste', 'E-mail', 'Téléphone', 'Contrat', "Date d'entrée", 'Administrateur']];
  for (const e of [...ctx.state.employees].sort((a, b) => a.last_name.localeCompare(b.last_name))) {
    rows.push([e.last_name, e.first_name, e.username, e.role, e.email, e.phone, e.contract, e.start_date || '', e.is_admin ? 'oui' : 'non']);
  }
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`registre-personnel-versatyl-${dayKey(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
  toast('Registre exporté (ouvrable avec Excel).', { type: 'success' });
}

function vcard(e) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e.last_name};${e.first_name};;;`, `FN:${fullName(e)}`, 'ORG:Versatyl', `TITLE:${e.role}`];
  if (e.email) lines.push(`EMAIL;TYPE=INTERNET:${e.email}`);
  if (e.phone) lines.push(`TEL;TYPE=CELL:${e.phone}`);
  lines.push('END:VCARD');
  download(`${fullName(e).replace(/\s+/g, '-')}.vcf`, lines.join('\r\n'), 'text/vcard;charset=utf-8');
}

export function openEmployee(id) {
  const e = ctx.emp(id);
  if (!e) return;
  const { me, events } = ctx.state;
  const self = e.id === me.id;
  const now = Date.now();
  const upcoming = events.filter(ev => isInvolved(ev, e.id) && !ev.done && evEnd(ev) >= now).sort(byStart).slice(0, 5);
  const roleList = [...new Set([...CONFIG.roles, ...ctx.state.employees.flatMap(rolesOf)])];

  const admin = me.is_admin && !self ? `
    <section class="info-card admin-card">
      <h4>${icon('shield')} Administration</h4>
      <form class="admin-form">
        <div class="field"><span>Poste(s) attribué(s)</span>${rolePicker(roleList, rolesOf(e))}</div>
        <div class="field-row">
          <label class="field"><span>Contrat</span><select class="input" name="contract"><option value="">—</option>
            ${CONFIG.contracts.map(c => `<option ${c === e.contract ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="field"><span>Arrivée</span><input class="input" type="date" name="start_date" value="${esc(e.start_date || '')}"></label>
        </div>
        <label class="switch"><input type="checkbox" name="is_admin" ${e.is_admin ? 'checked' : ''}><span></span>Administrateur·rice</label>
        <button class="btn btn-primary btn-block" type="submit">Enregistrer</button>
      </form>
      <div class="admin-actions">
        <button class="btn btn-ghost btn-sm" data-act="reset">${icon('key')}<span>Nouveau mot de passe</span></button>
        <button class="btn btn-ghost btn-sm btn-danger-text" data-act="delete">${icon('trash')}<span>Supprimer le compte</span></button>
      </div>
    </section>` : '';

  openModal({
    variant: 'drawer',
    html: `
      <header class="drawer-head" style="--c:${colorFor(e.id)}">
        <button class="icon-btn drawer-close" data-close aria-label="Fermer">${icon('x')}</button>
        ${avatar(e, 'xl')}
        <h2>${esc(fullName(e))}</h2>
        <div class="drawer-badges">${roleBadges(e)}${e.is_admin ? `<span class="admin-badge">${icon('shield')} Admin</span>` : ''}</div>
        <p class="muted">@${esc(e.username)}</p>
        <div class="contact-actions">
          ${e.phone ? `<a class="btn btn-secondary" href="tel:${esc(telHref(e.phone))}">${icon('phone')}<span>Appeler</span></a>` : ''}
          ${e.email ? `<a class="btn btn-secondary" href="mailto:${esc(e.email)}">${icon('mail')}<span>Écrire</span></a>` : ''}
          <button class="btn btn-secondary" data-act="vcard" title="Ajouter à mes contacts">${icon('idcard')}<span>Contact</span></button>
        </div>
      </header>
      <div class="drawer-body">
        <section class="info-card">
          <h4>Coordonnées</h4>
          <div class="info-row">${icon('mail')}<span>${esc(e.email) || '<em class="muted">Non renseigné</em>'}</span>${e.email ? `<button class="icon-btn icon-btn-xs" data-copy="${esc(e.email)}" aria-label="Copier">${icon('copy')}</button>` : ''}</div>
          <div class="info-row">${icon('phone')}<span>${esc(e.phone) || '<em class="muted">Non renseigné</em>'}</span>${e.phone ? `<button class="icon-btn icon-btn-xs" data-copy="${esc(e.phone)}" aria-label="Copier">${icon('copy')}</button>` : ''}</div>
        </section>
        <section class="info-card">
          <h4>Dans l'équipe</h4>
          <div class="info-row">${icon('briefcase')}<span>${esc(e.role)}${e.contract ? ` · ${esc(e.contract)}` : ''}</span></div>
          <div class="info-row">${icon('calendar')}<span>${e.start_date ? `Arrivée le ${fmtDateFull(e.start_date)} <em class="muted">(${seniority(e.start_date)})</em>` : 'Date d’arrivée non renseignée'}</span></div>
          <div class="info-row">${icon('user')}<span>Inscrit·e ${relative(e.created_at)}</span></div>
        </section>
        <section class="info-card">
          <h4>Prochains éléments</h4>
          ${upcoming.length ? upcoming.map(ev => `
            <button type="button" class="mini-ev" data-ev="${ev.id}" style="--c:${evColor(ev)}">${icon(KINDS[ev.kind].icon)}
              <span><b>${esc(ev.title)}</b><small>${esc(fmtWhen(ev))}</small></span></button>`).join('') : '<p class="muted">Rien de prévu.</p>'}
        </section>
        ${admin}
      </div>`,
    onMount: (box, close) => {
      box.addEventListener('click', async ev => {
        const cp = ev.target.closest('[data-copy]');
        if (cp) return (await copyText(cp.dataset.copy)) && toast('Copié dans le presse-papiers.', { type: 'success', timeout: 2000 });
        const mini = ev.target.closest('[data-ev]');
        if (mini) { close(); return openEventDetail(mini.dataset.ev); }
        const act = ev.target.closest('[data-act]')?.dataset.act;
        if (act === 'vcard') vcard(e);
        if (act === 'reset') resetPassword(e);
        if (act === 'delete') {
          const ok = await confirmDialog(`Le compte de ${fullName(e)} et tous les éléments qu'il ou elle a créés seront supprimés.`,
            { title: 'Supprimer ce compte ?', confirmLabel: 'Supprimer', danger: true });
          if (ok && await ctx.run(() => ctx.store.deleteEmployee(ctx.token, e.id), { success: 'Compte supprimé.' })) close();
        }
      });
      const form = box.querySelector('.admin-form');
      const readRoles = form && bindRolePicker(form);
      form?.addEventListener('submit', async ev => {
        ev.preventDefault();
        const fd = new FormData(form);
        const patch = { role: readRoles().join(', '), contract: fd.get('contract'), start_date: fd.get('start_date'), is_admin: form.is_admin.checked };
        if (!patch.role) return toast('Choisis au moins un poste.', { type: 'error' });
        const res = await withBusy(form.querySelector('[type=submit]'),
          () => ctx.run(() => ctx.store.updateEmployee(ctx.token, e.id, patch), { success: `Fiche de ${e.first_name} mise à jour.` }));
        if (res) close();
      });
    },
  });
}

function resetPassword(e) {
  openModal({
    className: 'modal-sm',
    html: `<form class="modal-body stack">
        <h3>Nouveau mot de passe pour ${esc(e.first_name)}</h3>
        <p class="muted">Communique-le à ${esc(e.first_name)} : il ou elle pourra le changer depuis son profil.</p>
        <label class="field"><span>Mot de passe</span><input class="input" name="pwd" minlength="4" required autofocus autocomplete="new-password"></label>
        <div class="row-end"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary">Valider</button></div>
      </form>`,
    onMount: (box, close) => {
      const form = box.querySelector('form');
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const pwd = form.pwd.value;
        if (pwd.length < 4) return toast('Au moins 4 caractères.', { type: 'error' });
        const hash = await hashPassword(e.username, pwd);
        if (await ctx.run(() => ctx.store.adminSetPassword(ctx.token, e.id, hash), { success: 'Mot de passe réinitialisé.' })) close();
      });
    },
  });
}

export function mount(el) {
  const s = ctx.state.team;
  const listEl = el.querySelector('.team-list');
  el.querySelector('#team-search').addEventListener('input', e => {
    s.q = e.target.value;
    listEl.innerHTML = renderList();
  });
  el.addEventListener('click', async e => {
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      e.stopPropagation();
      if (await copyText(cp.dataset.copy)) toast('Copié dans le presse-papiers.', { type: 'success', timeout: 2000 });
      return;
    }
    if (e.target.closest('[data-stop]')) return;
    const r = e.target.closest('[data-role]');
    if (r) { s.role = r.dataset.role; return ctx.rerender({ animate: true }); }
    const l = e.target.closest('[data-layout]');
    if (l) { s.layout = l.dataset.layout; return ctx.rerender({ animate: true }); }
    if (e.target.closest('[data-export]')) return exportCsv();
    const row = e.target.closest('[data-emp]');
    if (row) openEmployee(row.dataset.emp);
  });
}

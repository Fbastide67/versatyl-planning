// Mon profil : infos personnelles, notifications, thème, mot de passe
import { CONFIG } from '../config.js';
import { ctx } from '../ctx.js';
import { esc, avatar, fullName, roleBadges, colorFor } from '../util.js';
import { icon } from '../icons.js';
import { toast, withBusy, confirmDialog, passwordInput } from '../ui.js';
import { hashPassword } from '../store.js';
import { getTheme, setTheme } from '../theme.js';
import { pushSupport, enablePush, systemNotify, needsHomeScreen } from '../notify.js';
import { fmtDateFull } from '../dates.js';

export const title = 'Mon profil';

function pushStatus() {
  const s = pushSupport();
  if (needsHomeScreen()) return ['Sur iPhone : touche Partager puis « Sur l’écran d’accueil », et ouvre Versatyl depuis l’icône.', false];
  if (s === 'unsupported') return ['Non disponible sur ce navigateur.', false];
  if (s === 'denied') return ['Bloquées dans les réglages du navigateur : autorise-les pour ce site.', false];
  if (s === 'granted') return [ctx.store.mode === 'supabase' && CONFIG.vapidPublicKey
    ? 'Activées : tu es prévenu·e même site fermé.' : 'Activées pendant que le site est ouvert.', true];
  return ['Reçois une alerte à l’approche de tes deadlines.', false];
}

export function render() {
  const { me } = ctx.state;
  const [pushText, pushOn] = pushStatus();
  const theme = getTheme();
  return `<div class="profile">
    <section class="profile-hero" style="--c:${colorFor(me.id)}">
      ${avatar(me, 'xl')}
      <div>
        <h2>${esc(fullName(me))}</h2>
        <div class="drawer-badges">${roleBadges(me)}${me.is_admin ? `<span class="admin-badge">${icon('shield')} Admin</span>` : ''}</div>
        <p class="muted">@${esc(me.username)} · membre depuis le ${fmtDateFull(me.created_at)}</p>
      </div>
    </section>

    <div class="profile-grid">
      <section class="card">
        <h3>${icon('idcard')} Mes informations</h3>
        <form id="profile-form" class="stack">
          <div class="field-row">
            <label class="field"><span>Prénom</span><input class="input" name="first_name" value="${esc(me.first_name)}" required></label>
            <label class="field"><span>Nom</span><input class="input" name="last_name" value="${esc(me.last_name)}"></label>
          </div>
          <label class="field"><span>Poste(s)</span><input class="input" value="${esc(me.role)}" disabled>
            <small class="field-hint">${me.is_admin ? 'Modifiable depuis le registre du personnel.' : 'Ton poste est attribué par un·e administrateur·rice.'}</small></label>
          <div class="field-row">
            <label class="field"><span>E-mail</span><input class="input" type="email" name="email" value="${esc(me.email)}"></label>
            <label class="field"><span>Téléphone</span><input class="input" type="tel" name="phone" value="${esc(me.phone)}"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Contrat</span><select class="input" name="contract"><option value="">—</option>
              ${CONFIG.contracts.map(c => `<option ${c === me.contract ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span>Date d'arrivée</span><input class="input" type="date" name="start_date" value="${esc(me.start_date || '')}"></label>
          </div>
          <div class="row-end"><button class="btn btn-primary" type="submit">Enregistrer</button></div>
        </form>
      </section>

      <div class="stack">
        <section class="card">
          <h3>${icon('bell')} Notifications</h3>
          <div class="setting">
            <div><b>Notifications sur cet appareil</b><small>${esc(pushText)}</small></div>
            ${pushOn ? `<button class="btn btn-ghost btn-sm" id="push-test">Tester</button>`
              : needsHomeScreen() || pushSupport() !== 'default' ? '' : `<button class="btn btn-secondary btn-sm" id="push-enable">Activer</button>`}
          </div>
          <p class="muted small">Deadlines qui approchent, invitations, changements d'horaire : active les notifications sur chaque téléphone ou ordinateur où tu veux être prévenu·e.</p>
        </section>

        <section class="card">
          <h3>${icon('moon')} Apparence</h3>
          <div class="seg seg-block" id="theme-seg">
            ${[['light', 'Clair', 'sun'], ['dark', 'Sombre', 'moon'], ['auto', 'Auto', 'monitor']].map(([v, l, ic]) =>
              `<button type="button" class="${theme === v ? 'on' : ''}" data-theme="${v}">${icon(ic)}${l}</button>`).join('')}
          </div>
        </section>

        <section class="card">
          <h3>${icon('lock')} Mot de passe</h3>
          <form id="password-form" class="stack">
            <label class="field"><span>Mot de passe actuel</span>${passwordInput('name="old" autocomplete="current-password" required')}</label>
            <label class="field"><span>Nouveau mot de passe</span>${passwordInput('name="new" autocomplete="new-password" minlength="4" required')}</label>
            <div class="row-end"><button class="btn btn-ghost" type="submit">Changer</button></div>
          </form>
        </section>

        <section class="card">
          <h3>${icon('shield')} Compte</h3>
          <p class="muted small">${ctx.store.mode === 'supabase'
            ? 'Connecté à la base partagée de l’équipe.'
            : 'Mode démo : les données sont enregistrées uniquement dans ce navigateur.'}</p>
          <div class="row-end">
            <button class="btn btn-ghost btn-danger-text btn-sm" id="delete-me">${icon('trash')}<span>Supprimer mon compte</span></button>
            <button class="btn btn-ghost btn-sm" id="logout">${icon('logout')}<span>Se déconnecter</span></button>
          </div>
        </section>
      </div>
    </div>
  </div>`;
}

export function mount(el) {
  const { me } = ctx.state;
  const form = el.querySelector('#profile-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const patch = Object.fromEntries(['first_name', 'last_name', 'email', 'phone', 'contract', 'start_date'].map(k => [k, fd.get(k)]));
    if (!patch.first_name.trim()) return toast('Le prénom est obligatoire.', { type: 'error' });
    await withBusy(form.querySelector('[type=submit]'),
      () => ctx.run(() => ctx.store.updateEmployee(ctx.token, me.id, patch), { success: 'Profil mis à jour.' }));
  });

  el.querySelector('#push-enable')?.addEventListener('click', async e => {
    await withBusy(e.currentTarget, async () => {
      try {
        const mode = await enablePush(ctx.store, ctx.token);
        toast(mode === 'push' ? 'Notifications activées sur cet appareil.' : 'Notifications activées (site ouvert).', { type: 'success' });
      } catch (err) { toast(err.message, { type: 'error' }); }
    });
    ctx.rerender();
  });
  el.querySelector('#push-test')?.addEventListener('click', () => {
    systemNotify({ id: 'test', kind: 'reminder', payload: { title: 'Test Versatyl', kind: 'deadline', starts_at: new Date(Date.now() + 7200000).toISOString(), offset_min: 120 } });
    toast('Notification de test envoyée.', { type: 'success' });
  });

  el.querySelector('#theme-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-theme]');
    if (b) { setTheme(b.dataset.theme); ctx.rerender(); }
  });

  const pf = el.querySelector('#password-form');
  pf.addEventListener('submit', async e => {
    e.preventDefault();
    if (pf.new.value.length < 4) return toast('Le nouveau mot de passe doit faire au moins 4 caractères.', { type: 'error' });
    const [oldH, newH] = await Promise.all([hashPassword(me.username, pf.old.value), hashPassword(me.username, pf.new.value)]);
    if (await ctx.run(() => ctx.store.changePassword(ctx.token, oldH, newH), { success: 'Mot de passe changé.' })) pf.reset();
  });

  el.querySelector('#logout').addEventListener('click', () => ctx.logout());
  el.querySelector('#delete-me').addEventListener('click', async () => {
    const ok = await confirmDialog('Ton compte et tous les éléments que tu as créés seront supprimés définitivement.',
      { title: 'Supprimer ton compte ?', confirmLabel: 'Supprimer', danger: true });
    if (ok && await ctx.run(() => ctx.store.deleteEmployee(ctx.token, me.id))) ctx.logout(true);
  });
}

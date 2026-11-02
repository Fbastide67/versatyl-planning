// Écran de connexion / création de compte
import { CONFIG } from '../config.js';
import { ctx } from '../ctx.js';
import { esc } from '../util.js';
import { icon } from '../icons.js';
import { hashPassword } from '../store.js';
import { withBusy } from '../ui.js';

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function renderAuth(root, { firstUser, onAuthed }) {
  const roleOptions = CONFIG.roles.map(r => `<option>${esc(r)}</option>`).join('');
  const contractOptions = CONFIG.contracts.map(c => `<option>${esc(c)}</option>`).join('');
  root.innerHTML = `
  <div class="auth">
    <section class="auth-hero" aria-hidden="true">
      <video src="assets/da/anim-1.mp4" autoplay muted loop playsinline></video>
      <div class="auth-hero-text">
        <span class="eyebrow">Planning · Deadlines · Équipe</span>
        <h1>Toute l'équipe,<br>au même endroit.</h1>
      </div>
    </section>
    <section class="auth-panel">
      <div class="auth-card">
        <div class="auth-brand"><span class="brand-logo"></span><span class="brand-sub">Planning</span></div>
        <div class="seg seg-block auth-tabs" role="tablist">
          <button type="button" role="tab" data-tab="login" class="${firstUser ? '' : 'on'}">Connexion</button>
          <button type="button" role="tab" data-tab="signup" class="${firstUser ? 'on' : ''}">Créer mon compte</button>
        </div>
        ${ctx.store.mode === 'local' ? `<div class="callout callout-warn">${icon('alert')}<span><b>Mode démo</b> : les comptes sont enregistrés seulement dans ce navigateur.</span></div>` : ''}

        <form id="login-form" class="auth-form" ${firstUser ? 'hidden' : ''} novalidate>
          <label class="field"><span>Identifiant</span>
            <input class="input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
          <label class="field"><span>Mot de passe</span>
            <input class="input" name="password" type="password" autocomplete="current-password" required></label>
          <p class="form-error" hidden></p>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Se connecter</button>
          <p class="auth-hint">Première connexion ? <a href="#" data-tab="signup">Crée ton compte</a> en une minute.</p>
          <p class="auth-hint small">Mot de passe oublié ? Un·e administrateur·rice peut le réinitialiser depuis le registre.</p>
        </form>

        <form id="signup-form" class="auth-form" ${firstUser ? '' : 'hidden'} novalidate>
          ${firstUser ? `<div class="callout">${icon('shield')}<span>Tu es la première personne inscrite : ton compte sera <b>administrateur</b>.</span></div>` : ''}
          <div class="field-row">
            <label class="field"><span>Prénom *</span><input class="input" name="first_name" autocomplete="given-name" required></label>
            <label class="field"><span>Nom</span><input class="input" name="last_name" autocomplete="family-name"></label>
          </div>
          <label class="field"><span>Identifiant *</span>
            <input class="input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
            <small class="field-hint">Il te servira à te connecter (lettres, chiffres, . _ -).</small></label>
          <label class="field"><span>Mot de passe *</span>
            <input class="input" name="password" type="password" autocomplete="new-password" minlength="4" required></label>
          <div class="field-row">
            <label class="field"><span>Poste *</span>
              <select class="input" name="role_choice" required>
                <option value="" disabled selected>Choisir…</option>${roleOptions}<option value="__other">Autre…</option>
              </select></label>
            <label class="field" data-other hidden><span>Ton poste</span><input class="input" name="role_other" placeholder="Ex : Photographe"></label>
          </div>
          <div class="field-row">
            <label class="field"><span>Téléphone</span><input class="input" name="phone" type="tel" autocomplete="tel"></label>
            <label class="field"><span>E-mail</span><input class="input" name="email" type="email" autocomplete="email"></label>
          </div>
          <small class="field-hint">Ton téléphone et ton e-mail sont visibles par l'équipe dans le registre.</small>
          <div class="field-row">
            <label class="field"><span>Contrat</span><select class="input" name="contract"><option value="">—</option>${contractOptions}</select></label>
            <label class="field"><span>Date d'arrivée</span><input class="input" name="start_date" type="date"></label>
          </div>
          <p class="form-error" hidden></p>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Créer mon compte</button>
        </form>
      </div>
    </section>
  </div>`;

  const login = root.querySelector('#login-form');
  const signup = root.querySelector('#signup-form');
  const tabs = root.querySelectorAll('.auth-tabs button');

  const showTab = name => {
    tabs.forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    login.hidden = name !== 'login';
    signup.hidden = name !== 'signup';
    (name === 'login' ? login : signup).querySelector('input').focus();
  };
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) { e.preventDefault(); showTab(t.dataset.tab); }
  });

  const fail = (form, msg) => {
    const p = form.querySelector('.form-error');
    p.textContent = msg;
    p.hidden = !msg;
    if (msg) form.classList.remove('shake'), void form.offsetWidth, form.classList.add('shake');
  };

  login.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(login);
    const username = f.get('username').trim();
    const password = f.get('password');
    if (!username || !password) return fail(login, 'Renseigne ton identifiant et ton mot de passe.');
    fail(login, '');
    await withBusy(login.querySelector('[type=submit]'), async () => {
      try {
        const res = await ctx.store.login(username, await hashPassword(username, password));
        await onAuthed(res);
      } catch (err) { fail(login, err.message); }
    });
  });

  // Identifiant proposé automatiquement à partir du prénom et du nom
  let usernameTouched = false;
  signup.username.addEventListener('input', () => { usernameTouched = true; });
  const suggest = () => {
    if (usernameTouched) return;
    signup.username.value = [slug(signup.first_name.value), slug(signup.last_name.value)].filter(Boolean).join('.');
  };
  signup.first_name.addEventListener('input', suggest);
  signup.last_name.addEventListener('input', suggest);
  signup.role_choice.addEventListener('change', () => {
    const other = signup.role_choice.value === '__other';
    signup.querySelector('[data-other]').hidden = !other;
    if (other) signup.role_other.focus();
  });

  signup.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(signup);
    const username = f.get('username').trim().toLowerCase();
    const password = f.get('password');
    const role = f.get('role_choice') === '__other' ? f.get('role_other').trim() : f.get('role_choice');
    const email = f.get('email').trim();
    if (!f.get('first_name').trim()) return fail(signup, 'Indique ton prénom.');
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return fail(signup, "L'identifiant doit faire 3 à 32 caractères (lettres, chiffres, . _ -).");
    if (password.length < 4) return fail(signup, 'Le mot de passe doit faire au moins 4 caractères.');
    if (!role) return fail(signup, 'Choisis ton poste.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return fail(signup, 'Cette adresse e-mail ne semble pas valide.');
    fail(signup, '');
    await withBusy(signup.querySelector('[type=submit]'), async () => {
      try {
        const res = await ctx.store.signup(username, await hashPassword(username, password), {
          first_name: f.get('first_name'), last_name: f.get('last_name'), role, email,
          phone: f.get('phone'), contract: f.get('contract'), start_date: f.get('start_date'),
        });
        await onAuthed(res);
      } catch (err) { fail(signup, err.message); }
    });
  });

  requestAnimationFrame(() => (firstUser ? signup : login).querySelector('input').focus());
}

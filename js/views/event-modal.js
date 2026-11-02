// Fiche détaillée et formulaire de création / modification d'un événement
import { ctx } from '../ctx.js';
import { esc, avatar, fullName, PALETTE } from '../util.js';
import { icon } from '../icons.js';
import { openModal, confirmDialog, burst, toast, withBusy } from '../ui.js';
import { KINDS, REMINDER_OPTIONS, evColor, evStart, evEnd, canEdit, canToggle, urgency, involvedIds } from '../events.js';
import { fmtWhen, relative, dayKey, timeKey, combine, offsetLabel, HOUR } from '../dates.js';

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function openEventDetail(id) {
  const ev = ctx.state.events.find(e => e.id === id);
  if (!ev) return toast("Cet événement n'existe plus.", { type: 'error' });
  const { me, employees } = ctx.state;
  const k = KINDS[ev.kind] || KINDS.event;
  const owner = canEdit(ev, me);
  const toggle = ev.kind !== 'event' && canToggle(ev, me);
  const u = urgency(ev);
  const creator = ctx.emp(ev.created_by);
  const people = ev.everyone
    ? `<span class="person person-all">${icon('users')} Toute l'équipe</span>`
    : involvedIds(ev, employees).map(pid => ctx.emp(pid)).filter(Boolean)
      .map(p => `<span class="person">${avatar(p, 'sm')}${esc(fullName(p))}</span>`).join('');
  const status = ev.done ? '<span class="status-badge is-done">Terminé</span>'
    : u === 'late' ? '<span class="status-badge is-late">En retard</span>'
    : u === 'soon' ? '<span class="status-badge is-soon">Moins de 24 h</span>' : '';

  openModal({
    className: 'modal-detail',
    html: `
      <header class="detail-head" style="--c:${evColor(ev)}">
        <span class="kind-badge">${icon(k.icon)} ${k.label}</span>${status}
        <span class="spacer"></span>
        <button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button>
      </header>
      <div class="modal-body detail">
        <h2 class="detail-title ${ev.done ? 'is-done' : ''}">${esc(ev.title)}</h2>
        <ul class="detail-list">
          <li>${icon('clock')}<span>${esc(cap(fmtWhen(ev)))} <em>· ${relative(ev.starts_at)}</em></span></li>
          ${ev.location ? `<li>${icon('pin')}<span>${esc(ev.location)}</span></li>` : ''}
          <li>${icon('bell')}<span>${ev.reminders.length ? 'Rappel ' + ev.reminders.map(offsetLabel).join(', ') + ' avant' : 'Aucun rappel'}</span></li>
        </ul>
        ${ev.description ? `<p class="detail-desc">${esc(ev.description)}</p>` : ''}
        <h4 class="section-label">Personnes concernées</h4>
        <div class="people">${people || '<span class="muted">Personne</span>'}</div>
        <p class="detail-meta">${avatar(creator, 'xs')}<span>Créé par <b>${esc(fullName(creator))}</b> · ${relative(ev.created_at)}</span></p>
        ${owner ? '' : `<p class="hint">${icon('lock')} Seule la personne qui l'a créé peut le modifier ou le supprimer.</p>`}
      </div>
      <footer class="modal-foot">
        ${owner ? `<button class="btn btn-ghost btn-danger-text" data-act="delete">${icon('trash')}<span>Supprimer</span></button>` : ''}
        <span class="spacer"></span>
        ${toggle ? `<button class="btn ${ev.done ? 'btn-ghost' : 'btn-success'}" data-act="done">${ev.done ? 'Rouvrir' : icon('check') + '<span>Terminé</span>'}</button>` : ''}
        ${owner ? `<button class="btn btn-primary" data-act="edit">${icon('edit')}<span>Modifier</span></button>` : '<button class="btn btn-ghost" data-close>Fermer</button>'}
      </footer>`,
    onMount: (box, close) => {
      box.addEventListener('click', async e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'edit') {
          close();
          openEventForm(ev);
        } else if (act === 'delete') {
          const ok = await confirmDialog(`« ${ev.title} » sera supprimé pour tout le monde et les personnes concernées seront prévenues.`,
            { title: 'Supprimer cet élément ?', confirmLabel: 'Supprimer', danger: true });
          if (ok && await ctx.run(() => ctx.store.deleteEvent(ctx.token, ev.id), { success: 'Élément supprimé.' })) close();
        } else if (act === 'done') {
          if (!ev.done) burst(btn, '#16a34a');
          await withBusy(btn, () => ctx.run(() => ctx.store.setDone(ctx.token, ev.id, !ev.done),
            { success: ev.done ? 'Élément rouvert.' : 'Bravo, c’est terminé !' }));
          close();
        }
      });
    },
  });
}

// init : un événement existant (modification) ou des valeurs par défaut { day, kind, participants, everyone }
export function openEventForm(init = {}) {
  const editing = !!init.id;
  const { me, employees } = ctx.state;
  let kind = init.kind || 'event';

  let start;
  let end;
  if (editing) {
    start = evStart(init);
    end = init.ends_at ? evEnd(init) : new Date(start.getTime() + HOUR);
  } else {
    start = init.day ? new Date(init.day) : new Date();
    if (init.day) start.setHours(kind === 'event' ? 9 : 18, 0, 0, 0);
    else start.setHours(start.getHours() + 1, 0, 0, 0);
    end = new Date(start.getTime() + HOUR);
  }

  const f = {
    color: init.color || '',
    everyone: !!init.everyone,
    participants: new Set(editing ? init.participants : (init.participants ?? [me.id])),
    reminders: new Set(init.reminders ?? KINDS[kind].reminders),
    remindersTouched: editing,
  };

  const sortedEmps = [...employees].sort((a, b) => (b.id === me.id) - (a.id === me.id) || a.first_name.localeCompare(b.first_name));

  const html = `
    <form class="ev-form ${init.all_day ? 'is-allday' : ''}" data-kind="${kind}" novalidate>
      <header class="form-head">
        <h3>${editing ? 'Modifier' : 'Ajouter au planning'}</h3>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <div class="kind-switch" role="radiogroup" aria-label="Type">
          ${Object.entries(KINDS).map(([key, v]) => `
            <button type="button" role="radio" class="kind-opt ${key === kind ? 'on' : ''}" data-kind="${key}" style="--c:${v.color}" aria-checked="${key === kind}">
              ${icon(v.icon)}<span>${v.label}</span></button>`).join('')}
        </div>
        <input class="input input-title" name="title" placeholder="Titre (ex : Shooting lookbook)" value="${esc(init.title || '')}" maxlength="120" autocomplete="off" autofocus>
        <div class="when">
          <label class="field"><span data-label-start>${kind === 'event' ? 'Début' : 'Échéance'}</span>
            <div class="dt"><input class="input" type="date" name="start_date" value="${dayKey(start)}"><input class="input t" type="time" name="start_time" value="${timeKey(start)}"></div></label>
          <label class="field" data-only="event"><span>Fin</span>
            <div class="dt"><input class="input" type="date" name="end_date" value="${dayKey(end)}"><input class="input t" type="time" name="end_time" value="${timeKey(end)}"></div></label>
        </div>
        <label class="switch" data-only="event"><input type="checkbox" name="all_day" ${init.all_day ? 'checked' : ''}><span></span>Journée entière</label>

        <div class="field"><span>Qui est concerné ?</span>
          <div class="picker">
            <button type="button" class="chip chip-team ${f.everyone ? 'on' : ''}" data-everyone>${icon('users')} Toute l'équipe</button>
            ${sortedEmps.map(e => `<button type="button" class="chip ${f.participants.has(e.id) ? 'on' : ''}" data-pid="${e.id}" ${f.everyone ? 'disabled' : ''}>${avatar(e, 'xs')}${esc(e.first_name)}${e.id === me.id ? ' (moi)' : ''}</button>`).join('')}
          </div>
          <small class="field-hint" data-people-hint></small>
        </div>

        <div class="field"><span>Rappels</span>
          <div class="chips">${REMINDER_OPTIONS.map(([m, label]) => `<button type="button" class="chip ${f.reminders.has(m) ? 'on' : ''}" data-rem="${m}">${label}</button>`).join('')}</div>
          <small class="field-hint">Les personnes concernées reçoivent une notification sur leur téléphone.</small>
        </div>

        <details class="more" ${init.location || init.description || init.color ? 'open' : ''}>
          <summary>${icon('chevD')} Lieu, description, couleur</summary>
          <label class="field"><span>Lieu</span><input class="input" name="location" value="${esc(init.location || '')}" placeholder="Studio, visio, adresse…"></label>
          <label class="field"><span>Description</span><textarea class="input" name="description" rows="3" placeholder="Détails, liens, brief…">${esc(init.description || '')}</textarea></label>
          <div class="field"><span>Couleur</span>
            <div class="swatches">
              <button type="button" class="swatch swatch-auto ${f.color ? '' : 'on'}" data-color="" title="Automatique">A</button>
              ${PALETTE.map(c => `<button type="button" class="swatch ${c === f.color ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Couleur ${c}"></button>`).join('')}
            </div></div>
        </details>
        <p class="form-error" hidden></p>
      </div>
      <footer class="modal-foot">
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter'}</button>
      </footer>
    </form>`;

  openModal({
    className: 'modal-form',
    html,
    onMount: (box, close) => {
      const form = box.querySelector('form');
      const err = form.querySelector('.form-error');
      const hint = form.querySelector('[data-people-hint]');
      let duration = Math.max(15 * 60000, end - start);

      const peopleHint = () => {
        hint.textContent = f.everyone ? 'Tout le monde sera prévenu, y compris les futurs inscrits.'
          : f.participants.size ? '' : 'Personne de sélectionné : ce sera dans ta ligne du planning.';
      };
      peopleHint();

      const readStart = () => combine(form.start_date.value, form.start_time.value || '09:00');
      const syncEnd = () => {
        if (!form.start_date.value) return;
        const e2 = new Date(readStart().getTime() + duration);
        form.end_date.value = dayKey(e2);
        form.end_time.value = timeKey(e2);
      };
      form.start_date.addEventListener('change', syncEnd);
      form.start_time.addEventListener('change', syncEnd);
      const updateDuration = () => {
        const e2 = combine(form.end_date.value || form.start_date.value, form.end_time.value);
        if (e2 > readStart()) duration = e2 - readStart();
      };
      form.end_date.addEventListener('change', updateDuration);
      form.end_time.addEventListener('change', updateDuration);
      form.all_day.addEventListener('change', () => form.classList.toggle('is-allday', form.all_day.checked));

      form.addEventListener('click', e => {
        const kb = e.target.closest('[data-kind]');
        if (kb && kb.closest('.kind-switch')) {
          kind = kb.dataset.kind;
          form.dataset.kind = kind;
          // Heure par défaut : 9h pour un événement, 18h pour une échéance
          if (!editing && ['09:00', '18:00'].includes(form.start_time.value)) {
            form.start_time.value = kind === 'event' ? '09:00' : '18:00';
            syncEnd();
          }
          form.querySelectorAll('.kind-opt').forEach(b => {
            b.classList.toggle('on', b === kb);
            b.setAttribute('aria-checked', b === kb);
          });
          form.querySelector('[data-label-start]').textContent = kind === 'event' ? 'Début' : 'Échéance';
          if (!f.remindersTouched) {
            f.reminders = new Set(KINDS[kind].reminders);
            form.querySelectorAll('[data-rem]').forEach(b => b.classList.toggle('on', f.reminders.has(+b.dataset.rem)));
          }
          return;
        }
        if (e.target.closest('[data-everyone]')) {
          f.everyone = !f.everyone;
          e.target.closest('[data-everyone]').classList.toggle('on', f.everyone);
          form.querySelectorAll('[data-pid]').forEach(b => { b.disabled = f.everyone; });
          return peopleHint();
        }
        const pb = e.target.closest('[data-pid]');
        if (pb) {
          const id = pb.dataset.pid;
          f.participants.has(id) ? f.participants.delete(id) : f.participants.add(id);
          pb.classList.toggle('on', f.participants.has(id));
          return peopleHint();
        }
        const rb = e.target.closest('[data-rem]');
        if (rb) {
          const m = +rb.dataset.rem;
          f.reminders.has(m) ? f.reminders.delete(m) : f.reminders.add(m);
          f.remindersTouched = true;
          rb.classList.toggle('on', f.reminders.has(m));
          return;
        }
        const sw = e.target.closest('[data-color]');
        if (sw) {
          f.color = sw.dataset.color;
          form.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b === sw));
        }
      });

      form.addEventListener('submit', async e => {
        e.preventDefault();
        const showErr = msg => { err.textContent = msg; err.hidden = false; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); };
        const title = form.elements.title.value.trim();
        if (!title) { form.elements.title.focus(); return showErr('Donne un titre.'); }
        if (!form.start_date.value) return showErr('Choisis une date.');
        const allDay = kind === 'event' && form.all_day.checked;
        const startsAt = combine(form.start_date.value, allDay ? '00:00' : form.start_time.value || '09:00');
        let endsAt = null;
        if (kind === 'event') {
          const ed = form.end_date.value || form.start_date.value;
          if (allDay) {
            if (ed < form.start_date.value) return showErr('La date de fin est avant le début.');
            endsAt = ed > form.start_date.value ? combine(ed, '00:00') : null;
          } else {
            endsAt = combine(ed, form.end_time.value || timeKey(new Date(startsAt.getTime() + HOUR)));
            if (endsAt <= startsAt) return showErr('La fin doit être après le début.');
          }
        }
        const payload = {
          title, kind,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt ? endsAt.toISOString() : null,
          all_day: allDay,
          everyone: f.everyone,
          participants: f.everyone ? [] : [...f.participants],
          reminders: [...f.reminders],
          color: f.color,
          location: form.location.value.trim(),
          description: form.description.value.trim(),
        };
        const btn = form.querySelector('[type=submit]');
        const res = await withBusy(btn, () => ctx.run(
          () => (editing ? ctx.store.updateEvent(ctx.token, init.id, payload) : ctx.store.createEvent(ctx.token, payload)),
          { success: editing ? 'Modifications enregistrées.' : `${KINDS[kind].label} ajouté${kind === 'event' ? '' : 'e'} au planning !` }));
        if (res) close();
      });
    },
  });
}

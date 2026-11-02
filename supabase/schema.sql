-- =====================================================================
--  Versatyl Planning — base de données Supabase
--  Supabase > SQL Editor > New query > coller tout ce fichier > Run
--  Le script peut être relancé sans risque (il remet à jour les fonctions).
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  first_name text not null,
  last_name text not null default '',
  role text not null default 'Employé',
  email text not null default '',
  phone text not null default '',
  contract text not null default '',
  start_date date,
  is_admin boolean not null default false,
  email_notifications boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists employees_username_key on public.employees (lower(username));

create table if not exists public.sessions (
  token uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  kind text not null default 'event' check (kind in ('event', 'task', 'deadline')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text not null default '',
  color text not null default '',
  everyone boolean not null default false,
  participants uuid[] not null default '{}',
  reminders int[] not null default '{1440,60}',
  reminders_from timestamptz not null default now(),
  done boolean not null default false,
  created_by uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_starts_at_idx on public.events (starts_at);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  kind text not null, -- invite | update | cancel | done | reminder
  payload jsonb not null default '{}',
  read boolean not null default false,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_employee_idx on public.notifications (employee_id, created_at desc);

create table if not exists public.reminders_sent (
  event_id uuid not null references public.events(id) on delete cascade,
  offset_min int not null,
  primary key (event_id, offset_min)
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- Accès : lecture libre, écritures uniquement via les fonctions app_* ----------

alter table public.employees enable row level security;
alter table public.sessions enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;
alter table public.reminders_sent enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.employees, public.sessions, public.events, public.notifications,
  public.reminders_sent, public.push_subscriptions from anon, authenticated;

grant select on public.events, public.notifications to anon, authenticated;
drop policy if exists "lecture events" on public.events;
create policy "lecture events" on public.events for select using (true);
drop policy if exists "lecture notifications" on public.notifications;
create policy "lecture notifications" on public.notifications for select using (true);

-- Annuaire public (sans les mots de passe)
create or replace view public.employees_public as
  select id, username, first_name, last_name, role, email, phone, contract, start_date,
         is_admin, email_notifications, created_at
  from public.employees;
grant select on public.employees_public to anon, authenticated;

-- ---------- Fonctions internes ----------------------------------------

create or replace function public._require(p_token uuid)
returns public.employees language plpgsql stable security definer set search_path = public as $$
declare v public.employees;
begin
  select e.* into v from sessions s join employees e on e.id = s.employee_id where s.token = p_token;
  if v.id is null then
    raise exception 'Session expirée : reconnecte-toi.';
  end if;
  return v;
end $$;

create or replace function public._emp_json(e public.employees)
returns jsonb language sql immutable as $$
  select to_jsonb(e) - 'password_hash';
$$;

create or replace function public._uuids(j jsonb)
returns uuid[] language sql immutable as $$
  select coalesce(array(
    select distinct x::uuid
    from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) x
  ), '{}');
$$;

create or replace function public._ints(j jsonb)
returns int[] language sql immutable as $$
  select coalesce(array(
    select distinct x::int
    from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) x
    order by 1 desc
  ), '{}');
$$;

-- Personnes concernées : toute l'équipe, sinon les participants, sinon le créateur
create or replace function public._involved(e public.events)
returns uuid[] language sql stable security definer set search_path = public as $$
  select case
    when e.everyone then coalesce((select array_agg(id) from employees), '{}')
    when cardinality(e.participants) > 0 then e.participants
    else array[e.created_by]
  end;
$$;

create or replace function public._notify(p_ev public.events, p_kind text, p_actor public.employees,
                                         p_targets uuid[], p_extra jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into notifications (employee_id, event_id, kind, payload)
  select t,
         case when p_kind = 'cancel' then null else p_ev.id end,
         p_kind,
         jsonb_build_object(
           'title', p_ev.title, 'kind', p_ev.kind, 'starts_at', p_ev.starts_at, 'all_day', p_ev.all_day,
           'actor_id', p_actor.id, 'actor_name', trim(p_actor.first_name || ' ' || p_actor.last_name)
         ) || coalesce(p_extra, '{}')
  from unnest(p_targets) t
  where t is distinct from p_actor.id
    and exists (select 1 from employees where id = t);
$$;

-- ---------- Comptes ----------------------------------------------------

create or replace function public.app_signup(p_username text, p_password_hash text, p_profile jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v employees; v_token uuid; v_first boolean;
begin
  p_username := lower(trim(p_username));
  if p_username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Identifiant invalide : 3 à 32 caractères (lettres, chiffres, . _ -).';
  end if;
  if exists (select 1 from employees where lower(username) = p_username) then
    raise exception 'Cet identifiant est déjà pris.';
  end if;
  v_first := not exists (select 1 from employees);
  insert into employees (username, password_hash, first_name, last_name, role, email, phone, contract, start_date, is_admin)
  values (
    p_username, p_password_hash,
    coalesce(nullif(trim(p_profile->>'first_name'), ''), p_username),
    coalesce(trim(p_profile->>'last_name'), ''),
    coalesce(nullif(trim(p_profile->>'role'), ''), 'Employé'),
    coalesce(trim(p_profile->>'email'), ''),
    coalesce(trim(p_profile->>'phone'), ''),
    coalesce(trim(p_profile->>'contract'), ''),
    nullif(p_profile->>'start_date', '')::date,
    v_first
  ) returning * into v;
  insert into sessions (employee_id) values (v.id) returning token into v_token;
  return jsonb_build_object('employee', _emp_json(v), 'token', v_token);
end $$;

create or replace function public.app_login(p_username text, p_password_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v employees; v_token uuid;
begin
  select * into v from employees
  where lower(username) = lower(trim(p_username)) and password_hash = p_password_hash;
  if v.id is null then
    raise exception 'Identifiant ou mot de passe incorrect.';
  end if;
  delete from sessions where employee_id = v.id and created_at < now() - interval '180 days';
  insert into sessions (employee_id) values (v.id) returning token into v_token;
  return jsonb_build_object('employee', _emp_json(v), 'token', v_token);
end $$;

create or replace function public.app_session(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select _emp_json(e) from sessions s join employees e on e.id = s.employee_id where s.token = p_token;
$$;

create or replace function public.app_logout(p_token uuid)
returns void language sql security definer set search_path = public as $$
  delete from sessions where token = p_token;
$$;

create or replace function public.app_update_employee(p_token uuid, p_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token); v employees;
begin
  if p_id <> v_me.id and not v_me.is_admin then
    raise exception 'Tu ne peux modifier que ton propre profil.';
  end if;
  update employees set
    first_name = case when p_patch ? 'first_name' then coalesce(nullif(trim(p_patch->>'first_name'), ''), first_name) else first_name end,
    last_name  = case when p_patch ? 'last_name'  then coalesce(trim(p_patch->>'last_name'), '') else last_name end,
    email      = case when p_patch ? 'email'      then coalesce(trim(p_patch->>'email'), '') else email end,
    phone      = case when p_patch ? 'phone'      then coalesce(trim(p_patch->>'phone'), '') else phone end,
    contract   = case when p_patch ? 'contract'   then coalesce(trim(p_patch->>'contract'), '') else contract end,
    start_date = case when p_patch ? 'start_date' then nullif(p_patch->>'start_date', '')::date else start_date end,
    email_notifications = case when p_patch ? 'email_notifications'
                               then coalesce((p_patch->>'email_notifications')::boolean, email_notifications)
                               else email_notifications end,
    -- Le poste et les droits ne sont modifiables que par un administrateur
    role     = case when v_me.is_admin and p_patch ? 'role'
                    then coalesce(nullif(trim(p_patch->>'role'), ''), role) else role end,
    is_admin = case when v_me.is_admin and p_patch ? 'is_admin' and p_id <> v_me.id
                    then coalesce((p_patch->>'is_admin')::boolean, is_admin) else is_admin end
  where id = p_id
  returning * into v;
  if v.id is null then
    raise exception 'Cette personne n''existe plus.';
  end if;
  return _emp_json(v);
end $$;

create or replace function public.app_change_password(p_token uuid, p_old_hash text, p_new_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token);
begin
  if v_me.password_hash <> p_old_hash then
    raise exception 'Mot de passe actuel incorrect.';
  end if;
  update employees set password_hash = p_new_hash where id = v_me.id;
end $$;

create or replace function public.app_admin_set_password(p_token uuid, p_id uuid, p_new_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token);
begin
  if not v_me.is_admin then
    raise exception 'Réservé aux administrateurs.';
  end if;
  update employees set password_hash = p_new_hash where id = p_id;
  delete from sessions where employee_id = p_id;
end $$;

create or replace function public.app_delete_employee(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token);
begin
  if p_id <> v_me.id and not v_me.is_admin then
    raise exception 'Réservé aux administrateurs.';
  end if;
  delete from employees where id = p_id;
  update events set participants = array_remove(participants, p_id) where p_id = any(participants);
  -- Toujours au moins un administrateur
  if not exists (select 1 from employees where is_admin) then
    update employees set is_admin = true
    where id = (select id from employees order by created_at limit 1);
  end if;
end $$;

-- ---------- Événements / tâches / deadlines ---------------------------

create or replace function public.app_create_event(p_token uuid, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token); v events;
begin
  if coalesce(trim(p_event->>'title'), '') = '' then
    raise exception 'Le titre est obligatoire.';
  end if;
  insert into events (title, description, kind, starts_at, ends_at, all_day, location, color,
                      everyone, participants, reminders, created_by)
  values (
    trim(p_event->>'title'),
    coalesce(p_event->>'description', ''),
    coalesce(nullif(p_event->>'kind', ''), 'event'),
    (p_event->>'starts_at')::timestamptz,
    nullif(p_event->>'ends_at', '')::timestamptz,
    coalesce((p_event->>'all_day')::boolean, false),
    coalesce(p_event->>'location', ''),
    coalesce(p_event->>'color', ''),
    coalesce((p_event->>'everyone')::boolean, false),
    _uuids(p_event->'participants'),
    case when p_event ? 'reminders' then _ints(p_event->'reminders') else '{1440,60}' end,
    v_me.id
  ) returning * into v;
  perform _notify(v, 'invite', v_me, _involved(v));
  return to_jsonb(v);
end $$;

create or replace function public.app_update_event(p_token uuid, p_id uuid, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token); v_old events; v events;
begin
  select * into v_old from events where id = p_id;
  if v_old.id is null then
    raise exception 'Cet événement n''existe plus.';
  end if;
  if v_old.created_by <> v_me.id then
    raise exception 'Seule la personne qui a créé cet événement peut le modifier.';
  end if;
  update events set
    title        = case when p_event ? 'title' then coalesce(nullif(trim(p_event->>'title'), ''), title) else title end,
    description  = case when p_event ? 'description' then coalesce(p_event->>'description', '') else description end,
    kind         = case when p_event ? 'kind' then coalesce(nullif(p_event->>'kind', ''), kind) else kind end,
    starts_at    = case when p_event ? 'starts_at' then (p_event->>'starts_at')::timestamptz else starts_at end,
    ends_at      = case when p_event ? 'ends_at' then nullif(p_event->>'ends_at', '')::timestamptz else ends_at end,
    all_day      = case when p_event ? 'all_day' then coalesce((p_event->>'all_day')::boolean, all_day) else all_day end,
    location     = case when p_event ? 'location' then coalesce(p_event->>'location', '') else location end,
    color        = case when p_event ? 'color' then coalesce(p_event->>'color', '') else color end,
    everyone     = case when p_event ? 'everyone' then coalesce((p_event->>'everyone')::boolean, everyone) else everyone end,
    participants = case when p_event ? 'participants' then _uuids(p_event->'participants') else participants end,
    reminders    = case when p_event ? 'reminders' then _ints(p_event->'reminders') else reminders end,
    updated_at   = now()
  where id = p_id
  returning * into v;

  -- Nouvelle date ou nouveaux rappels : on reprogramme les rappels
  if v.starts_at is distinct from v_old.starts_at or v.reminders is distinct from v_old.reminders then
    delete from reminders_sent where event_id = p_id;
    update events set reminders_from = now() where id = p_id returning * into v;
  end if;

  perform _notify(v, 'invite', v_me,
    array(select unnest(_involved(v)) except select unnest(_involved(v_old))));
  if v.starts_at is distinct from v_old.starts_at or v.ends_at is distinct from v_old.ends_at
     or v.title <> v_old.title then
    perform _notify(v, 'update', v_me,
      array(select unnest(_involved(v)) intersect select unnest(_involved(v_old))));
  end if;
  return to_jsonb(v);
end $$;

create or replace function public.app_delete_event(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token); v events;
begin
  select * into v from events where id = p_id;
  if v.id is null then
    return;
  end if;
  if v.created_by <> v_me.id then
    raise exception 'Tu ne peux supprimer que tes propres événements.';
  end if;
  if v.starts_at > now() and not v.done then
    perform _notify(v, 'cancel', v_me, _involved(v));
  end if;
  delete from events where id = p_id;
end $$;

create or replace function public.app_set_done(p_token uuid, p_id uuid, p_done boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token); v events;
begin
  select * into v from events where id = p_id;
  if v.id is null then
    raise exception 'Cet événement n''existe plus.';
  end if;
  if v.created_by <> v_me.id and not (v_me.id = any(_involved(v))) then
    raise exception 'Tu ne participes pas à cet événement.';
  end if;
  update events set done = p_done, updated_at = now() where id = p_id returning * into v;
  if p_done and v.created_by <> v_me.id then
    perform _notify(v, 'done', v_me, array[v.created_by]);
  end if;
  return to_jsonb(v);
end $$;

-- ---------- Notifications ---------------------------------------------

create or replace function public.app_mark_read(p_token uuid, p_ids uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token);
begin
  update notifications set read = true
  where employee_id = v_me.id and not read and (p_ids is null or id = any(p_ids));
end $$;

create or replace function public.app_save_push(p_token uuid, p_sub jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_me employees := _require(p_token);
begin
  insert into push_subscriptions (endpoint, employee_id, subscription)
  values (p_sub->>'endpoint', v_me.id, p_sub)
  on conflict (endpoint) do update set employee_id = excluded.employee_id, subscription = excluded.subscription;
end $$;

create or replace function public.app_remove_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;

-- Crée les notifications de rappel arrivées à échéance (appelée par le site et par GitHub Actions)
create or replace function public.app_queue_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0;
begin
  for r in
    with due as (
      select e.id, m as offset_min
      from events e, unnest(e.reminders) m
      where not e.done
        and e.starts_at > now()
        and e.starts_at - make_interval(mins => m) <= now()
        and e.starts_at - make_interval(mins => m) >= e.reminders_from - interval '2 minutes'
        and e.starts_at - make_interval(mins => m) > now() - interval '12 hours'
        and not exists (select 1 from reminders_sent rs where rs.event_id = e.id and rs.offset_min = m)
    ), ins as (
      insert into reminders_sent (event_id, offset_min)
      select id, offset_min from due
      on conflict do nothing
      returning event_id, offset_min
    )
    -- Si plusieurs rappels tombent en même temps, on n'envoie que le plus proche
    select event_id, min(offset_min) as offset_min from ins group by event_id
  loop
    insert into notifications (employee_id, event_id, kind, payload)
    select u, e.id, 'reminder', jsonb_build_object(
      'title', e.title, 'kind', e.kind, 'starts_at', e.starts_at, 'all_day', e.all_day,
      'offset_min', r.offset_min)
    from events e, unnest(_involved(e)) u
    where e.id = r.event_id and exists (select 1 from employees where id = u);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Notifications à envoyer par mail / push (utilisée par GitHub Actions)
create or replace function public.app_pending_deliveries()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'payload', n.payload, 'created_at', n.created_at,
    'event', (select to_jsonb(e) from events e where e.id = n.event_id),
    'employee', jsonb_build_object('id', m.id, 'first_name', m.first_name, 'email', m.email,
                                   'email_notifications', m.email_notifications),
    'subscriptions', coalesce((select jsonb_agg(p.subscription) from push_subscriptions p
                               where p.employee_id = m.id), '[]'::jsonb)
  ) order by n.created_at), '[]'::jsonb)
  from notifications n join employees m on m.id = n.employee_id
  where not n.delivered and n.created_at > now() - interval '2 days';
$$;

create or replace function public.app_mark_delivered(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update notifications set delivered = true
  where not delivered and (id = any(p_ids) or created_at <= now() - interval '2 days');
$$;

-- ---------- Droits d'exécution ----------------------------------------

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'app\_%' or p.proname like '\_%')
  loop
    if f.proname like 'app\_%' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    else
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------- Temps réel (mise à jour instantanée du planning) ----------

do $$
begin
  begin
    alter publication supabase_realtime add table public.events;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when others then null;
  end;
end $$;

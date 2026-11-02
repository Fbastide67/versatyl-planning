// Accès aux données : Supabase (partagé) ou mode démo (localStorage)
import { CONFIG } from './config.js';
import { involvedIds, canSee } from './events.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export async function hashPassword(username, password) {
  const data = new TextEncoder().encode(`versatyl:${username.trim().toLowerCase()}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createStore() {
  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) {
    const { createClient } = await import(SUPABASE_JS);
    const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return new SupabaseStore(sb);
  }
  return new LocalStore();
}

// ---------------------------------------------------------------------
//  Supabase : toutes les écritures passent par les fonctions app_* (voir supabase/schema.sql)
// ---------------------------------------------------------------------

function friendly(error) {
  const msg = error?.message || String(error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Connexion au serveur impossible. Vérifie ta connexion internet.';
  if (/Could not find the function|does not exist|schema cache/i.test(msg)) {
    return "La base de données n'est pas initialisée : exécute supabase/schema.sql dans Supabase.";
  }
  return msg;
}

class SupabaseStore {
  mode = 'supabase';
  constructor(sb) { this.sb = sb; }

  async #rpc(fn, args = {}) {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(friendly(error));
    return data;
  }
  async #select(query) {
    const { data, error } = await query;
    if (error) throw new Error(friendly(error));
    return data;
  }

  signup(username, hash, profile) { return this.#rpc('app_signup', { p_username: username, p_password_hash: hash, p_profile: profile }); }
  login(username, hash) { return this.#rpc('app_login', { p_username: username, p_password_hash: hash }); }
  session(token) { return this.#rpc('app_session', { p_token: token }); }
  logout(token) { return this.#rpc('app_logout', { p_token: token }); }

  listEmployees() { return this.#select(this.sb.from('employees_public').select('*').order('first_name')); }
  updateEmployee(token, id, patch) { return this.#rpc('app_update_employee', { p_token: token, p_id: id, p_patch: patch }); }
  changePassword(token, oldHash, newHash) { return this.#rpc('app_change_password', { p_token: token, p_old_hash: oldHash, p_new_hash: newHash }); }
  adminSetPassword(token, id, hash) { return this.#rpc('app_admin_set_password', { p_token: token, p_id: id, p_new_hash: hash }); }
  deleteEmployee(token, id) { return this.#rpc('app_delete_employee', { p_token: token, p_id: id }); }

  // Via une fonction : les éléments privés ne sont renvoyés qu'aux personnes concernées
  listEvents(token) { return this.#rpc('app_list_events', { p_token: token }); }
  createEvent(token, ev) { return this.#rpc('app_create_event', { p_token: token, p_event: ev }); }
  updateEvent(token, id, ev) { return this.#rpc('app_update_event', { p_token: token, p_id: id, p_event: ev }); }
  deleteEvent(token, id) { return this.#rpc('app_delete_event', { p_token: token, p_id: id }); }
  setDone(token, id, done) { return this.#rpc('app_set_done', { p_token: token, p_id: id, p_done: done }); }

  listNotifications(token) { return this.#rpc('app_list_notifications', { p_token: token }); }
  markRead(token, ids = null) { return this.#rpc('app_mark_read', { p_token: token, p_ids: ids }); }
  savePush(token, sub) { return this.#rpc('app_save_push', { p_token: token, p_sub: sub }); }
  removePush(endpoint) { return this.#rpc('app_remove_push', { p_endpoint: endpoint }); }
  queueReminders() { return this.#rpc('app_queue_reminders'); }

  subscribe(cb) {
    const ch = this.sb.channel('vp-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => cb('events'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => cb('notifications'))
      .subscribe();
    return () => this.sb.removeChannel(ch);
  }
}

// ---------------------------------------------------------------------
//  Mode démo : mêmes règles que la base Supabase, stockées dans ce navigateur
// ---------------------------------------------------------------------

const DB_KEY = 'vp_demo_db';
const nowIso = () => new Date().toISOString();
const clean = v => String(v ?? '').trim();
const pub = ({ password_hash, ...rest }) => rest;
const uniq = a => [...new Set(a)];

class LocalStore {
  mode = 'local';
  #listeners = new Set();

  constructor() {
    window.addEventListener('storage', e => { if (e.key === DB_KEY) this.#emit('all'); });
  }

  #read() {
    try {
      const db = JSON.parse(localStorage.getItem(DB_KEY));
      if (db?.employees) return db;
    } catch { /* base vide ou illisible */ }
    return { employees: [], sessions: {}, events: [], notifications: [], reminders_sent: [] };
  }
  #write(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    this.#emit('all');
  }
  #emit(what) { for (const cb of this.#listeners) cb(what); }

  #me(db, token) {
    const me = db.employees.find(e => e.id === db.sessions[token]);
    if (!me) throw new Error('Session expirée : reconnecte-toi.');
    return me;
  }
  #notify(db, ev, kind, actor, targets, extra = {}) {
    for (const t of uniq(targets)) {
      if (t === actor?.id || !db.employees.some(e => e.id === t)) continue;
      db.notifications.push({
        id: crypto.randomUUID(), employee_id: t, event_id: kind === 'cancel' ? null : ev.id, kind,
        payload: {
          title: ev.title, kind: ev.kind, starts_at: ev.starts_at, all_day: ev.all_day, private: !!ev.is_private,
          ...(actor ? { actor_id: actor.id, actor_name: `${actor.first_name} ${actor.last_name}`.trim() } : {}),
          ...extra,
        },
        read: false, delivered: false, created_at: nowIso(),
      });
    }
  }
  #session(db, emp) {
    const token = crypto.randomUUID();
    db.sessions[token] = emp.id;
    return { employee: pub(emp), token };
  }

  async signup(username, hash, profile) {
    const db = this.#read();
    const u = clean(username).toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) throw new Error('Identifiant invalide : 3 à 32 caractères (lettres, chiffres, . _ -).');
    if (db.employees.some(e => e.username === u)) throw new Error('Cet identifiant est déjà pris.');
    const emp = {
      id: crypto.randomUUID(), username: u, password_hash: hash,
      first_name: clean(profile.first_name) || u, last_name: clean(profile.last_name),
      role: clean(profile.role) || 'Employé', email: clean(profile.email), phone: clean(profile.phone),
      contract: clean(profile.contract), start_date: profile.start_date || null,
      is_admin: db.employees.length === 0, email_notifications: true, created_at: nowIso(),
    };
    db.employees.push(emp);
    const res = this.#session(db, emp);
    this.#write(db);
    return res;
  }

  async login(username, hash) {
    const db = this.#read();
    const emp = db.employees.find(e => e.username === clean(username).toLowerCase() && e.password_hash === hash);
    if (!emp) throw new Error('Identifiant ou mot de passe incorrect.');
    const res = this.#session(db, emp);
    this.#write(db);
    return res;
  }

  async session(token) {
    const db = this.#read();
    const emp = db.employees.find(e => e.id === db.sessions[token]);
    return emp ? pub(emp) : null;
  }

  async logout(token) {
    const db = this.#read();
    delete db.sessions[token];
    this.#write(db);
  }

  async listEmployees() {
    return this.#read().employees.map(pub).sort((a, b) => a.first_name.localeCompare(b.first_name));
  }

  async updateEmployee(token, id, patch) {
    const db = this.#read();
    const me = this.#me(db, token);
    if (id !== me.id && !me.is_admin) throw new Error('Tu ne peux modifier que ton propre profil.');
    const e = db.employees.find(x => x.id === id);
    if (!e) throw new Error("Cette personne n'existe plus.");
    for (const k of ['last_name', 'email', 'phone', 'contract']) if (k in patch) e[k] = clean(patch[k]);
    if ('first_name' in patch && clean(patch.first_name)) e.first_name = clean(patch.first_name);
    if ('start_date' in patch) e.start_date = patch.start_date || null;
    if ('email_notifications' in patch) e.email_notifications = !!patch.email_notifications;
    if (me.is_admin && 'role' in patch && clean(patch.role)) e.role = clean(patch.role);
    if (me.is_admin && 'is_admin' in patch && id !== me.id) e.is_admin = !!patch.is_admin;
    this.#write(db);
    return pub(e);
  }

  async changePassword(token, oldHash, newHash) {
    const db = this.#read();
    const me = this.#me(db, token);
    if (me.password_hash !== oldHash) throw new Error('Mot de passe actuel incorrect.');
    me.password_hash = newHash;
    this.#write(db);
  }

  async adminSetPassword(token, id, hash) {
    const db = this.#read();
    if (!this.#me(db, token).is_admin) throw new Error('Réservé aux administrateurs.');
    const e = db.employees.find(x => x.id === id);
    if (e) e.password_hash = hash;
    for (const [t, eid] of Object.entries(db.sessions)) if (eid === id) delete db.sessions[t];
    this.#write(db);
  }

  async deleteEmployee(token, id) {
    const db = this.#read();
    const me = this.#me(db, token);
    if (id !== me.id && !me.is_admin) throw new Error('Réservé aux administrateurs.');
    db.employees = db.employees.filter(e => e.id !== id);
    for (const [t, eid] of Object.entries(db.sessions)) if (eid === id) delete db.sessions[t];
    const gone = new Set(db.events.filter(e => e.created_by === id).map(e => e.id));
    db.events = db.events.filter(e => !gone.has(e.id));
    for (const ev of db.events) ev.participants = ev.participants.filter(p => p !== id);
    db.notifications = db.notifications.filter(n => n.employee_id !== id && !gone.has(n.event_id));
    if (db.employees.length && !db.employees.some(e => e.is_admin)) {
      [...db.employees].sort((a, b) => a.created_at.localeCompare(b.created_at))[0].is_admin = true;
    }
    this.#write(db);
  }

  async listEvents(token) {
    const db = this.#read();
    const meId = db.sessions[token];
    return db.events.filter(ev => canSee(ev, meId));
  }

  async createEvent(token, input) {
    const db = this.#read();
    const me = this.#me(db, token);
    if (!clean(input.title)) throw new Error('Le titre est obligatoire.');
    const ev = {
      id: crypto.randomUUID(), title: clean(input.title), description: input.description || '',
      kind: input.kind || 'event', starts_at: new Date(input.starts_at).toISOString(),
      ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : null, all_day: !!input.all_day,
      location: input.location || '', color: input.color || '',
      is_private: !!input.is_private, everyone: !!input.everyone && !input.is_private,
      calendar: input.calendar === 'com' ? 'com' : 'team', channels: uniq(input.channels || []),
      participants: uniq(input.participants || []),
      reminders: input.reminders ? uniq(input.reminders.map(Number)).sort((a, b) => b - a) : [1440, 60],
      reminders_from: nowIso(), done: false, created_by: me.id, created_at: nowIso(), updated_at: nowIso(),
    };
    db.events.push(ev);
    this.#notify(db, ev, 'invite', me, involvedIds(ev, db.employees));
    this.#write(db);
    return ev;
  }

  async updateEvent(token, id, input) {
    const db = this.#read();
    const me = this.#me(db, token);
    const ev = db.events.find(e => e.id === id);
    if (!ev) throw new Error("Cet événement n'existe plus.");
    if (ev.created_by !== me.id) throw new Error('Seule la personne qui a créé cet événement peut le modifier.');
    const old = { ...ev };
    if ('title' in input && clean(input.title)) ev.title = clean(input.title);
    for (const k of ['description', 'location', 'color', 'kind']) if (k in input) ev[k] = input[k] || (k === 'kind' ? ev.kind : '');
    if ('starts_at' in input) ev.starts_at = new Date(input.starts_at).toISOString();
    if ('ends_at' in input) ev.ends_at = input.ends_at ? new Date(input.ends_at).toISOString() : null;
    if ('all_day' in input) ev.all_day = !!input.all_day;
    if ('everyone' in input) ev.everyone = !!input.everyone;
    if ('is_private' in input) ev.is_private = !!input.is_private;
    if (ev.is_private) ev.everyone = false;
    if ('calendar' in input) ev.calendar = input.calendar === 'com' ? 'com' : 'team';
    if ('channels' in input) ev.channels = uniq(input.channels || []);
    if ('participants' in input) ev.participants = uniq(input.participants || []);
    if ('reminders' in input) ev.reminders = uniq((input.reminders || []).map(Number)).sort((a, b) => b - a);
    ev.updated_at = nowIso();
    if (ev.starts_at !== old.starts_at || ev.reminders.join() !== old.reminders.join()) {
      db.reminders_sent = db.reminders_sent.filter(k => !k.startsWith(id + '|'));
      ev.reminders_from = nowIso();
    }
    const before = involvedIds(old, db.employees);
    const after = involvedIds(ev, db.employees);
    this.#notify(db, ev, 'invite', me, after.filter(x => !before.includes(x)));
    if (ev.starts_at !== old.starts_at || ev.ends_at !== old.ends_at || ev.title !== old.title) {
      this.#notify(db, ev, 'update', me, after.filter(x => before.includes(x)));
    }
    this.#write(db);
    return ev;
  }

  async deleteEvent(token, id) {
    const db = this.#read();
    const me = this.#me(db, token);
    const ev = db.events.find(e => e.id === id);
    if (!ev) return;
    if (ev.created_by !== me.id) throw new Error('Tu ne peux supprimer que tes propres événements.');
    if (new Date(ev.starts_at) > new Date() && !ev.done) this.#notify(db, ev, 'cancel', me, involvedIds(ev, db.employees));
    db.events = db.events.filter(e => e.id !== id);
    db.notifications = db.notifications.filter(n => n.event_id !== id);
    this.#write(db);
  }

  async setDone(token, id, done) {
    const db = this.#read();
    const me = this.#me(db, token);
    const ev = db.events.find(e => e.id === id);
    if (!ev) throw new Error("Cet événement n'existe plus.");
    if (ev.created_by !== me.id && !involvedIds(ev, db.employees).includes(me.id)) {
      throw new Error('Tu ne participes pas à cet événement.');
    }
    ev.done = !!done;
    ev.updated_at = nowIso();
    if (done && ev.created_by !== me.id) this.#notify(db, ev, 'done', me, [ev.created_by]);
    this.#write(db);
    return ev;
  }

  async listNotifications(token, meId) {
    return this.#read().notifications
      .filter(n => n.employee_id === meId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 60);
  }

  async markRead(token, ids = null) {
    const db = this.#read();
    const me = this.#me(db, token);
    let changed = false;
    for (const n of db.notifications) {
      if (n.employee_id === me.id && !n.read && (!ids || ids.includes(n.id))) { n.read = true; changed = true; }
    }
    if (changed) this.#write(db);
  }

  async savePush() { /* Les notifications push serveur nécessitent Supabase */ }
  async removePush() { /* idem */ }

  async queueReminders() {
    const db = this.#read();
    const t = Date.now();
    let count = 0;
    for (const ev of db.events) {
      const start = Date.parse(ev.starts_at);
      if (ev.done || start <= t) continue;
      const from = Date.parse(ev.reminders_from || ev.created_at);
      const due = ev.reminders.filter(m => {
        const at = start - m * 60000;
        return at <= t && at >= from - 120000 && at > t - 12 * 3600000 && !db.reminders_sent.includes(`${ev.id}|${m}`);
      });
      if (!due.length) continue;
      due.forEach(m => db.reminders_sent.push(`${ev.id}|${m}`));
      this.#notify(db, ev, 'reminder', null, involvedIds(ev, db.employees), { offset_min: Math.min(...due) });
      count++;
    }
    if (count) this.#write(db);
    return count;
  }

  subscribe(cb) {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }
}

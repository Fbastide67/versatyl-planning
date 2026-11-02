import { startOfDay, DAY, HOUR } from './dates.js';

export const KINDS = {
  event: { label: 'Événement', icon: 'calendar', color: '#7c3aed', reminders: [1440, 60] },
  task: { label: 'Tâche', icon: 'task', color: '#0891b2', reminders: [1440] },
  deadline: { label: 'Deadline', icon: 'flag', color: '#e11db5', reminders: [4320, 1440, 120] },
};

export const REMINDER_OPTIONS = [
  [10080, '1 semaine'], [4320, '3 jours'], [1440, '1 jour'], [120, '2 heures'], [60, '1 heure'], [30, '30 min'],
];

export const evColor = ev => ev.color || KINDS[ev.kind]?.color || KINDS.event.color;
export const evStart = ev => new Date(ev.starts_at);
export const evEnd = ev => new Date(ev.ends_at || ev.starts_at);

// L'événement apparaît-il ce jour-là ?
export function occursOn(ev, day) {
  const d = startOfDay(day).getTime();
  return startOfDay(evStart(ev)).getTime() <= d && d <= startOfDay(evEnd(ev)).getTime();
}

// Lignes du planning où l'événement s'affiche : « team » ou les participants (sinon le créateur)
export function rowsFor(ev) {
  if (ev.everyone) return ['team'];
  if (ev.participants?.length) return ev.participants;
  return [ev.created_by];
}

// Personnes concernées (même règle que la base de données)
export function involvedIds(ev, employees) {
  if (ev.everyone) return employees.map(e => e.id);
  if (ev.participants?.length) return ev.participants;
  return [ev.created_by];
}

export const isInvolved = (ev, meId) =>
  ev.everyone || (ev.participants?.length ? ev.participants.includes(meId) : ev.created_by === meId);
export const isMine = (ev, meId) => isInvolved(ev, meId) || ev.created_by === meId;
export const canEdit = (ev, me) => ev.created_by === me?.id;
export const canToggle = (ev, me) => canEdit(ev, me) || isInvolved(ev, me?.id);

// done | late | soon (< 24 h) | week (< 7 j) | later
export function urgency(ev, now = Date.now()) {
  if (ev.done) return 'done';
  const diff = evStart(ev) - now;
  if (ev.kind === 'event') return diff < 0 ? 'past' : 'later';
  if (diff < 0) return 'late';
  if (diff < 24 * HOUR) return 'soon';
  if (diff < 7 * DAY) return 'week';
  return 'later';
}

export const byStart = (a, b) => evStart(a) - evStart(b);

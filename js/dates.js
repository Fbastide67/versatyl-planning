// Outils de dates (semaine du lundi au dimanche, formats français)
export const MIN = 60000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function addMonths(d, n) { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; }
export function startOfWeek(d) { const x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); }
export function startOfMonth(d) { const x = startOfDay(d); x.setDate(1); return x; }

const pad = n => String(n).padStart(2, '0');
export function dayKey(d) { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
export function parseDayKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export const sameDay = (a, b) => dayKey(a) === dayKey(b);
export const timeKey = d => { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };

export function combine(dateStr, timeStr = '00:00') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function isoWeek(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - y0) / DAY + 1) / 7);
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (opts, tz) => new Intl.DateTimeFormat('fr-FR', tz ? { ...opts, timeZone: tz } : opts);

export const fmtTime = (d, tz) => fmt({ hour: '2-digit', minute: '2-digit' }, tz).format(new Date(d)).replace(':', 'h');
export const fmtWeekday = d => cap(fmt({ weekday: 'short' }).format(d));
export const fmtDate = (d, tz) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }, tz).format(new Date(d));
export const fmtDateShort = (d, tz) => fmt({ day: 'numeric', month: 'short' }, tz).format(new Date(d));
export const fmtDateFull = (d, tz) => fmt({ day: 'numeric', month: 'long', year: 'numeric' }, tz).format(new Date(d));
export const fmtMonth = d => cap(fmt({ month: 'long', year: 'numeric' }).format(d));

// « lundi 2 novembre · 14h00 – 15h30 », « 2 nov. → 5 nov. », …
export function fmtWhen(ev, tz) {
  const start = new Date(ev.starts_at);
  const end = ev.ends_at ? new Date(ev.ends_at) : null;
  const multi = end && fmt({ dateStyle: 'short' }, tz).format(start) !== fmt({ dateStyle: 'short' }, tz).format(end);
  if (ev.all_day) {
    return multi ? `${fmtDateShort(start, tz)} → ${fmtDateShort(end, tz)} · journées entières` : `${fmtDate(start, tz)} · journée entière`;
  }
  if (multi) return `${fmtDateShort(start, tz)} ${fmtTime(start, tz)} → ${fmtDateShort(end, tz)} ${fmtTime(end, tz)}`;
  const prefix = ev.kind === 'deadline' || ev.kind === 'task' ? 'avant ' : '';
  return `${fmtDate(start, tz)} · ${prefix}${fmtTime(start, tz)}${end ? ' – ' + fmtTime(end, tz) : ''}`;
}

export function relative(date, now = Date.now()) {
  const diff = new Date(date) - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / MIN), h = Math.round(abs / HOUR), d = Math.round(abs / DAY);
  let s;
  if (m < 1) return "à l'instant";
  if (m < 60) s = `${m} min`;
  else if (h < 24) s = `${h} h`;
  else if (d < 7) s = `${d} j`;
  else if (d < 60) s = `${Math.round(d / 7)} sem.`;
  else s = `${Math.round(d / 30)} mois`;
  return diff >= 0 ? `dans ${s}` : `il y a ${s}`;
}

// Compte à rebours court pour les deadlines : « J-3 », « 5 h », « 20 min », « +2 j »
export function countdown(date, now = Date.now()) {
  const diff = new Date(date) - now;
  if (diff < 0) {
    const d = Math.floor(-diff / DAY);
    return d >= 1 ? `+${d} j` : `+${Math.max(1, Math.round(-diff / HOUR))} h`;
  }
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))} min`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h`;
  return `J-${Math.ceil(diff / DAY)}`;
}

export function offsetLabel(min) {
  const n = (v, w) => `${v} ${w}${v > 1 ? 's' : ''}`;
  if (min % 10080 === 0) return n(min / 10080, 'semaine');
  if (min % 1440 === 0) return n(min / 1440, 'jour');
  if (min % 60 === 0) return n(min / 60, 'heure');
  return `${min} minutes`;
}

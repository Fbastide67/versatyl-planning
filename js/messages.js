// Textes des notifications — partagés entre le site et l'envoi des mails (GitHub Actions)
import { fmtWhen, offsetLabel } from './dates.js';

const LABELS = { event: 'Événement', task: 'Tâche', deadline: 'Deadline', post: 'Publication' };

export function notificationText(n, tz) {
  const p = n.payload || {};
  const t = `« ${p.title || 'Sans titre'} »`;
  const who = p.actor_name || "Quelqu'un";
  const when = p.starts_at ? fmtWhen({ starts_at: p.starts_at, all_day: p.all_day, kind: p.kind }, tz) : '';
  const label = LABELS[p.kind] || LABELS.event;

  switch (n.kind) {
    case 'invite':
      return { icon: 'calendar', title: `${who} t'a ajouté·e à ${t}`, body: `${label} · ${when}` };
    case 'update':
      return { icon: 'edit', title: `${t} a été modifié`, body: `${who} a changé l'horaire : ${when}` };
    case 'cancel':
      return { icon: 'x', title: `${t} a été annulé`, body: `Par ${who} · c'était prévu ${when}` };
    case 'done':
      return { icon: 'check', title: `${who} a terminé ${t}`, body: `${label} · ${when}` };
    case 'reminder': {
      const soon = `dans ${offsetLabel(p.offset_min || 0)}`;
      if (p.kind === 'deadline') return { icon: 'flag', title: `Deadline ${t} ${soon}`, body: when };
      if (p.kind === 'task') return { icon: 'task', title: `Tâche ${t} à rendre ${soon}`, body: when };
      if (p.kind === 'post') return { icon: 'megaphone', title: `Publication ${t} prévue ${soon}`, body: when };
      return { icon: 'clock', title: `${t} commence ${soon}`, body: when };
    }
    default:
      return { icon: 'bell', title: t, body: when };
  }
}

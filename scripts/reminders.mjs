// Rappels de deadlines et notifications sur téléphone / ordinateur (push).
// Lancé automatiquement par GitHub Actions toutes les 15 minutes (.github/workflows/reminders.yml).
import webpush from 'web-push';
import { CONFIG } from '../js/config.js';
import { notificationText } from '../js/messages.js';

const TZ = 'Europe/Paris';

if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) {
  console.log('Supabase non configuré (js/config.js) : rien à faire.');
  process.exit(0);
}

async function rpc(fn, args = {}) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} : ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const linkFor = n => `${CONFIG.siteUrl}#/planning${n.event?.id ? `?event=${n.event.id}` : ''}`;

// 1. Rappels arrivés à échéance -> notifications
const queued = await rpc('app_queue_reminders');
console.log(`${queued} rappel(s) mis en file`);

// 2. Notifications pas encore envoyées
const pending = await rpc('app_pending_deliveries');
console.log(`${pending.length} notification(s) à envoyer`);
if (!pending.length) process.exit(0);

const canPush = !!(process.env.VAPID_PRIVATE_KEY && CONFIG.vapidPublicKey);
if (canPush) webpush.setVapidDetails(CONFIG.siteUrl, CONFIG.vapidPublicKey, process.env.VAPID_PRIVATE_KEY);
else console.log('Clé VAPID_PRIVATE_KEY absente : pas de notifications push.');

// 3. Une notification push par élément, sur chaque appareil de la personne
let sent = 0;
for (const n of pending) {
  if (!canPush) break;
  const { title, body } = notificationText(n, TZ);
  for (const sub of n.subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, url: linkFor(n), tag: `vp-${n.id}` }));
      sent++;
    } catch (err) {
      // Appareil désabonné : on l'oublie
      if (err.statusCode === 404 || err.statusCode === 410) await rpc('app_remove_push', { p_endpoint: sub.endpoint });
      else console.warn('Push refusé :', err.statusCode || '', err.body || err.message);
    }
  }
}

await rpc('app_mark_delivered', { p_ids: pending.map(n => n.id) });
console.log(`${pending.length} notification(s) traitée(s), ${sent} push envoyé(s)`);

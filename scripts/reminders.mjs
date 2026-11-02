// Rappels de deadlines et notifications par e-mail / push.
// Lancé automatiquement par GitHub Actions toutes les 15 minutes (.github/workflows/reminders.yml).
import { CONFIG } from '../js/config.js';
import { notificationText } from '../js/messages.js';

const TZ = 'Europe/Paris';
const env = process.env;

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

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const linkFor = n => `${CONFIG.siteUrl}#/planning${n.event?.id ? `?event=${n.event.id}` : ''}`;

function emailHtml(firstName, items) {
  const rows = items.map(({ n, title, body }) => `
    <tr><td style="padding:14px 18px;border-bottom:1px solid #eee8f6">
      <div style="font:700 15px/1.4 Arial,sans-serif;color:#1b1426">${esc(title)}</div>
      <div style="font:13px/1.5 Arial,sans-serif;color:#554b68;margin-top:2px">${esc(body)}</div>
      <a href="${esc(linkFor(n))}" style="font:700 13px Arial,sans-serif;color:#6614d6;text-decoration:none">Voir dans le planning →</a>
    </td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f4f2f9;padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e0f0">
    <tr><td style="padding:22px 18px 10px;text-align:center;background:#f8f6fc">
      <img src="${esc(CONFIG.siteUrl)}assets/logo.png" alt="Versatyl" width="180" style="display:inline-block;max-width:60%;height:auto">
    </td></tr>
    <tr><td style="padding:18px 18px 6px;font:15px/1.5 Arial,sans-serif;color:#1b1426">Salut ${esc(firstName)},<br>voici ce qui bouge sur ton planning :</td></tr>
    ${rows}
    <tr><td style="padding:20px 18px;text-align:center">
      <a href="${esc(CONFIG.siteUrl)}" style="display:inline-block;background:#6614d6;color:#fff;font:700 14px Arial,sans-serif;padding:12px 22px;border-radius:10px;text-decoration:none">Ouvrir Versatyl Planning</a>
      <p style="font:12px Arial,sans-serif;color:#8d84a0;margin:16px 0 0">Tu peux couper ces e-mails depuis « Mon profil ».</p>
    </td></tr>
  </table></body></html>`;
}

// 1. Rappels arrivés à échéance -> notifications
const queued = await rpc('app_queue_reminders');
console.log(`${queued} rappel(s) mis en file`);

// 2. Notifications pas encore envoyées
const pending = await rpc('app_pending_deliveries');
console.log(`${pending.length} notification(s) à envoyer`);
if (!pending.length) process.exit(0);

let mailer = null;
if (env.SMTP_USER && env.SMTP_PASS) {
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(env.SMTP_PORT || 465);
  mailer = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
} else {
  console.log('SMTP_USER / SMTP_PASS absents : pas d’e-mails (voir README).');
}

let webpush = null;
if (env.VAPID_PRIVATE_KEY && CONFIG.vapidPublicKey) {
  webpush = (await import('web-push')).default;
  webpush.setVapidDetails(CONFIG.siteUrl, CONFIG.vapidPublicKey, env.VAPID_PRIVATE_KEY);
} else {
  console.log('Clés VAPID absentes : pas de notifications push.');
}

// 3. Envoi : un seul e-mail par personne, une notification push par élément
const byPerson = new Map();
for (const n of pending) {
  const list = byPerson.get(n.employee.id) || [];
  list.push({ n, ...notificationText(n, TZ) });
  byPerson.set(n.employee.id, list);
}

const delivered = [];
for (const items of byPerson.values()) {
  const who = items[0].n.employee;
  try {
    if (mailer && who.email && who.email_notifications) {
      await mailer.sendMail({
        from: env.MAIL_FROM || `Versatyl Planning <${env.SMTP_USER}>`,
        to: who.email,
        subject: items.length === 1 ? items[0].title : `${items.length} nouveautés sur ton planning Versatyl`,
        text: items.map(i => `${i.title}\n${i.body}\n${linkFor(i.n)}`).join('\n\n'),
        html: emailHtml(who.first_name, items),
      });
      console.log(`E-mail envoyé à ${who.first_name} (${items.length})`);
    }
    if (webpush) {
      for (const { n, title, body } of items) {
        for (const sub of n.subscriptions) {
          try {
            await webpush.sendNotification(sub, JSON.stringify({ title, body, url: linkFor(n), tag: `vp-${n.id}` }));
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) await rpc('app_remove_push', { p_endpoint: sub.endpoint });
            else console.warn('Push refusé :', err.statusCode || '', err.body || err.message);
          }
        }
      }
    }
    delivered.push(...items.map(i => i.n.id));
  } catch (err) {
    console.error(`Échec de l'envoi à ${who.first_name} :`, err.message);
  }
}

await rpc('app_mark_delivered', { p_ids: delivered });
console.log(`${delivered.length} notification(s) traitée(s)`);

// Notifications du navigateur et abonnement push
import { CONFIG } from './config.js';
import { notificationText } from './messages.js';

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

export function pushSupport() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission; // default | granted | denied
}

function keyToBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// Demande l'autorisation puis abonne cet appareil aux notifications push (si Supabase est branché)
export async function enablePush(store, token) {
  if (pushSupport() === 'unsupported') {
    throw new Error("Ce navigateur ne gère pas les notifications. Sur iPhone, ajoute d'abord le site à l'écran d'accueil.");
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Les notifications sont bloquées dans les réglages du navigateur.');
  if (store.mode !== 'supabase' || !CONFIG.vapidPublicKey || !('PushManager' in window)) return 'local';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(CONFIG.vapidPublicKey) });
  }
  await store.savePush(token, sub.toJSON());
  return 'push';
}

// iPhone / iPad hors application installée : les notifications n'y sont pas disponibles
export function needsHomeScreen() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
}

// Si les notifications sont déjà autorisées, on (ré)enregistre l'appareil pour la personne connectée
export async function syncPush(store, token) {
  if (pushSupport() === 'granted') await enablePush(store, token).catch(() => {});
}

// À la déconnexion, l'appareil ne reçoit plus les notifications de ce compte
export async function disablePush(store) {
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) await store.removePush(sub.endpoint);
  } catch { /* rien à retirer */ }
}

// Affiche une notification système (même « tag » que le push serveur pour éviter les doublons)
export async function systemNotify(n) {
  if (pushSupport() !== 'granted') return;
  const { title, body } = notificationText(n);
  const options = { body, tag: `vp-${n.id}`, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png',
    data: { url: n.event_id ? `#/planning?event=${n.event_id}` : '#/planning' } };
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, options);
  } catch {
    new Notification(title, options);
  }
}

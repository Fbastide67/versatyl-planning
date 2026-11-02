export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Couleurs disponibles pour les événements et les postes
export const PALETTE = ['#7c3aed', '#e11db5', '#2563eb', '#0891b2', '#16a34a', '#d97706', '#ea580c', '#dc2626', '#db2777', '#475569'];

export function colorFor(key) {
  let h = 0;
  for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const fullName = e => (e ? `${e.first_name} ${e.last_name}`.trim() : 'Ancien membre');
export const initials = e => ((e?.first_name?.[0] || '') + (e?.last_name?.[0] || '')).toUpperCase() || '?';

// Photo de profil : une petite image encodée dans la fiche (data:image/…)
export const photoOf = e => (/^data:image\/(jpeg|png|webp);base64,/.test(e?.photo || '') ? e.photo : '');

export function avatar(e, size = 'md') {
  const photo = photoOf(e);
  return `<span class="avatar avatar-${size}" style="--c:${colorFor(e?.id || e?.username)}" title="${esc(fullName(e))}">${photo ? `<img src="${esc(photo)}" alt="" decoding="async">` : esc(initials(e))}</span>`;
}

// Recadre l'image au carré et la réduit (une quinzaine de Ko) avant de l'enregistrer
export async function squarePhoto(file, size = 192) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw new Error('Image illisible : choisis une photo JPEG ou PNG.'); }
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
    g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function roleBadge(role) {
  return `<span class="role-badge" style="--c:${colorFor(role)}">${esc(role || '—')}</span>`;
}

// Une personne peut avoir plusieurs postes, enregistrés séparés par des virgules
export const rolesOf = e => String(e?.role || '').split(',').map(r => r.trim()).filter(Boolean);
export const mainRole = e => rolesOf(e)[0] || '';
export const roleBadges = e => (rolesOf(e).map(roleBadge).join('') || roleBadge(''));

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const plural = (n, word, many = word + 's') => `${n} ${n > 1 ? many : word}`;

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

export function avatar(e, size = 'md') {
  return `<span class="avatar avatar-${size}" style="--c:${colorFor(e?.id || e?.username)}" title="${esc(fullName(e))}">${esc(initials(e))}</span>`;
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

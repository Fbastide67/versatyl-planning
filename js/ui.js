// Composants d'interface : toasts, modales, chargeurs, animations
import { $, $$, esc } from './util.js';
import { icon } from './icons.js';

// Chargeur « épines » inspiré de la DA : couronne d'épines tribales autour de la mascotte
const THORN = 'M0 -50 C 9 -38 12 -27 6 -16 Q 0 -11 -5 -16 C -1 -26 -1 -38 0 -50 Z';
export function spikeLoader(size = 'md', label = 'Chargement') {
  const thorns = Array.from({ length: 12 }, (_, i) =>
    `<g transform="rotate(${i * 30})"><path class="thorn" style="--i:${i}" d="${THORN}"/></g>`).join('');
  return `<div class="spike-loader spike-${size}" role="status" aria-label="${esc(label)}">
    <svg viewBox="-60 -60 120 120" aria-hidden="true">
      <defs><linearGradient id="thorn-grad" x1="0" y1="-50" x2="0" y2="-10" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#f50fc4"/><stop offset="1" stop-color="#6614d6"/></linearGradient></defs>
      <g class="thorns">${thorns}</g>
    </svg>
    <img src="assets/mascotte-256.png" alt="">
  </div>`;
}

export function toast(message, { type = 'info', title = '', timeout = 4500, iconName } = {}) {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const ic = iconName || { error: 'alert', success: 'check', info: 'bell' }[type] || 'bell';
  el.innerHTML = `<span class="toast-icon">${icon(ic)}</span>
    <div class="toast-body">${title ? `<strong>${esc(title)}</strong>` : ''}<p>${esc(message)}</p></div>
    <button class="toast-close" aria-label="Fermer">${icon('x')}</button>
    <span class="toast-progress" style="animation-duration:${timeout}ms"></span>`;
  wrap.appendChild(el);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 300);
  };
  el.querySelector('.toast-close').addEventListener('click', close);
  setTimeout(close, timeout);
  while (wrap.children.length > 4) wrap.firstElementChild.remove();
  return close;
}

// Modale générique (variant : 'modal' centré ou 'drawer' latéral)
export function openModal({ html, variant = 'modal', className = '', onMount, onClose }) {
  const root = document.createElement('div');
  root.className = `overlay overlay-${variant}`;
  root.innerHTML = `<div class="${variant} ${className}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(root);
  document.body.classList.add('has-overlay');
  const box = root.firstElementChild;
  let closed = false;

  const onKey = e => { if (e.key === 'Escape' && root === $$('.overlay').at(-1)) close(); };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    root.classList.add('is-leaving');
    setTimeout(() => {
      root.remove();
      if (!$('.overlay')) document.body.classList.remove('has-overlay');
      onClose?.();
    }, 240);
  }
  document.addEventListener('keydown', onKey);
  root.addEventListener('mousedown', e => { if (e.target === root) close(); });
  root.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  onMount?.(box, close);
  requestAnimationFrame(() => box.querySelector('[autofocus]')?.focus());
  return close;
}

export function confirmDialog(message, { title = 'Confirmer', confirmLabel = 'Confirmer', danger = false } = {}) {
  return new Promise(resolve => {
    let answer = false;
    openModal({
      className: 'modal-sm',
      html: `<div class="modal-body confirm">
          <span class="confirm-icon ${danger ? 'is-danger' : ''}">${icon(danger ? 'trash' : 'alert')}</span>
          <h3>${esc(title)}</h3><p>${esc(message)}</p>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-close>Annuler</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok autofocus>${esc(confirmLabel)}</button>
        </div>`,
      onMount: (box, close) => box.querySelector('[data-ok]').addEventListener('click', () => { answer = true; close(); }),
      onClose: () => resolve(answer),
    });
  });
}

// Explosion d'épines (quand une deadline est terminée)
export function burst(target, color = '#f50fc4') {
  const r = target.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'burst';
  el.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--c:${color}`;
  el.innerHTML = Array.from({ length: 10 }, (_, i) => `<i style="--r:${i * 36}deg"></i>`).join('');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// Bouton en état « chargement » pendant une action
export async function withBusy(button, fn) {
  if (!button) return fn();
  const html = button.innerHTML;
  button.disabled = true;
  button.classList.add('is-busy');
  button.innerHTML = `<span class="btn-spinner"></span>${html}`;
  try { return await fn(); } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
    button.innerHTML = html;
  }
}

export function skeletonRows(n = 5) {
  return Array.from({ length: n }, (_, i) =>
    `<div class="skeleton-row" style="--i:${i}"><span class="sk sk-avatar"></span><span class="sk sk-line"></span><span class="sk sk-block"></span><span class="sk sk-block"></span><span class="sk sk-block"></span></div>`).join('');
}

export function emptyState(title, text, action = '') {
  return `<div class="empty"><img src="assets/mascotte-256.png" alt="" class="empty-mascot"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}

// Thème clair / sombre / automatique
const KEY = 'vp_theme';

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(theme = getTheme()) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* stockage indisponible */ }
  applyTheme(theme);
}

export function isDark() {
  const t = getTheme();
  return t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
}

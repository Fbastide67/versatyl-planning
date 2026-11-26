// Filtres du planning mémorisés sur l'appareil (poste, canal, « Moi seulement »)
const FILTERS_KEY = 'versatyl.filters';
function savedFilters(name) {
  try { return JSON.parse(localStorage.getItem(FILTERS_KEY))?.[name] || {}; } catch { return {}; }
}
export function saveFilters(name, filters) {
  try {
    const all = JSON.parse(localStorage.getItem(FILTERS_KEY)) || {};
    all[name] = filters;
    localStorage.setItem(FILTERS_KEY, JSON.stringify(all));
  } catch { /* navigation privée */ }
}

// État partagé entre les vues (rempli par app.js)
export const ctx = {
  store: null,
  token: null,
  state: {
    me: null,
    employees: [],
    events: [],
    notifications: [],
    planning: { anchor: new Date(), view: 'month', mine: false, role: '', ...savedFilters('planning') },
    com: { anchor: new Date(), view: 'month', mine: false, channel: '', ...savedFilters('com') },
    deadlines: { tab: 'upcoming', mine: true },
    team: { q: '', role: '', layout: window.innerWidth < 760 ? 'cards' : 'table' },
  },
  emp(id) { return this.state.employees.find(e => e.id === id); },
  // Fonctions branchées par app.js
  refresh: async () => {},
  rerender: () => {},
  run: async () => {},
  logout: async () => {},
};

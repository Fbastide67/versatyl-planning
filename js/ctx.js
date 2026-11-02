// État partagé entre les vues (rempli par app.js)
export const ctx = {
  store: null,
  token: null,
  state: {
    me: null,
    employees: [],
    events: [],
    notifications: [],
    planning: { anchor: new Date(), view: window.innerWidth < 760 ? 'day' : 'week', mine: false, role: '' },
    com: { anchor: new Date(), view: window.innerWidth < 760 ? 'day' : 'week', mine: false, channel: '' },
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

// =====================================================================
//  Configuration de Versatyl Planning
// =====================================================================
//  Tant que supabaseUrl / supabaseAnonKey sont vides, le site tourne en
//  « mode démo » : tout est enregistré dans le navigateur de chacun.
//  Une fois Supabase branché (voir README), toute l'équipe partage les
//  mêmes comptes, le même planning et reçoit les rappels.
// =====================================================================

export const CONFIG = {
  supabaseUrl: 'https://emupbuanhoxvspzwmmbd.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdXBidWFuaG94dnNwendtbWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MjM4ODAsImV4cCI6MjEwOTE5OTg4MH0.3nhQMvdKbPuWmRGcgXHZb2GK4Q8wStbSpBW81jX26A8',

  // Clé publique des notifications push (la clé privée est un secret GitHub)
  vapidPublicKey: 'BBwwklro244TvQxe_OuYXO1XkTpdvuM9tpaRDRilGWNexE-xS4zWkWQsPXFXO5mXEYJ0ZqNZ7BzW4m3lTXFnLMI',

  // Adresse publique du site (utilisée dans les liens des notifications)
  siteUrl: 'https://fbastide67.github.io/versatyl-planning/',

  // Canaux du plan de com (une ligne chacun dans le planning « Plan de com »)
  channels: ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube', 'Newsletter', 'Site web', 'Presse'],

  // Postes proposés à l'inscription (on peut en cocher plusieurs et en saisir d'autres)
  roles: [
    'Président', 'Trésorerie', 'Alternant de Com', 'Réalisateur', 'Vidéaste',
    'Photographe', 'Monteur', 'Graphiste', 'Animatrice 3D',
  ],

  contracts: ['CDI', 'CDD', 'Alternance', 'Stage', 'Freelance', 'Intérim', 'Bénévole'],
};

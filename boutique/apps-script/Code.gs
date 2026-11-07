/**
 * BOUTIQUE T-SHIRT — script Google (à coller dans Extensions > Apps Script du Google Sheets)
 *
 * Ce script :
 *  1. crée la page de paiement Stripe (avec codes promo) quand quelqu'un clique sur « Payer » ;
 *  2. enregistre chaque commande payée dans l'onglet « Commandes » ;
 *  3. envoie au client un e-mail avec son QR code ;
 *  4. répond au scanner le soir de la soirée (et empêche de donner deux fois).
 *
 * Réglages secrets (Paramètres du projet ⚙️ > Propriétés du script) :
 *   STRIPE_SECRET_KEY  → sk_test_... pour tester, sk_live_... pour de vrai
 *   STAFF_PIN          → code que l'équipe tape sur la page scanner (6 chiffres ou plus)
 *   SITE_URL           → adresse de la boutique, terminée par /  (ex : https://pseudo.github.io/boutique/)
 */

// ====================== RÉGLAGES (garder pareil que config.js) ======================
var PRODUIT = {
  boutique: 'Versatyl',
  nom: 'T-shirt Soirée 2026',
  prixCentimes: 2500,                 // 25,00 €
  tailles: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  maxParTaille: 10,
  finPrecommande: '2026-11-30T23:59:00+01:00',
  retrait: 'À récupérer à la soirée du samedi 13 décembre 2026, sur présentation de ce QR code.',
  contact: 'contact@exemple.fr',
};
// ====================================================================================

var ONGLET = 'Commandes';
var COLONNES = ['Date', 'N° commande', 'Nom', 'E-mail', 'Téléphone', 'Articles', 'Nb t-shirts',
  'Sous-total (€)', 'Remise (€)', 'Code promo', 'Total payé (€)', 'Statut', 'Remis le', 'E-mail envoyé',
  'Code QR', 'Session Stripe'];
var COL = {}; COLONNES.forEach(function (c, i) { COL[c] = i; });
var SOURCE = 'boutique-tshirt';

// ---------------------------------------------------------------- Points d'entrée web

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  try {
    if (body.action === 'checkout') return json_(creerPaiement_(body.items));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err.message || err) });
  }
  return json_({ ok: false, error: 'Action inconnue' });
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'confirm') return json_(confirmer_(p.session_id));
    if (p.action === 'scan') return json_(scanner_(p.code, p.pin, false));
    if (p.action === 'undo') return json_(scanner_(p.code, p.pin, true));
    if (p.action === 'ping') return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err.message || err) });
  }
  return json_({ ok: false, error: 'Action inconnue' });
}

// ---------------------------------------------------------------- 1. Paiement

function creerPaiement_(items) {
  if (new Date() > new Date(PRODUIT.finPrecommande)) throw new Error('Les précommandes sont terminées');
  if (!Array.isArray(items) || !items.length) throw new Error('Panier vide');

  var lignes = [], resume = [], total = 0;
  items.forEach(function (it) {
    var taille = String(it.size), qte = Math.floor(Number(it.qty));
    if (PRODUIT.tailles.indexOf(taille) < 0) throw new Error('Taille inconnue : ' + taille);
    if (!(qte >= 1 && qte <= PRODUIT.maxParTaille)) throw new Error('Quantité invalide');
    total += qte;
    resume.push(taille + ':' + qte);
    lignes.push({
      quantity: qte,
      price_data: {
        currency: 'eur',
        unit_amount: PRODUIT.prixCentimes,
        product_data: { name: PRODUIT.nom + ' — Taille ' + taille },
      },
    });
  });
  if (total > 30) throw new Error('Maximum 30 t-shirts par commande');

  var site = prop_('SITE_URL');
  var session = stripe_('post', '/v1/checkout/sessions', {
    mode: 'payment',
    locale: 'fr',
    line_items: lignes,
    allow_promotion_codes: 'true',
    phone_number_collection: { enabled: 'true' },
    success_url: site + 'merci.html?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: site + '?annule=1',
    metadata: { source: SOURCE, articles: resume.join(',') },
    custom_text: { submit: { message: 'Précommande. ' + PRODUIT.retrait } },
  });
  return { ok: true, url: session.url };
}

// ---------------------------------------------------------------- 2. Enregistrement

/** Appelé par la page « merci » juste après le paiement. */
function confirmer_(sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sessionId))) throw new Error('Session invalide');
  var r = traiterSession_(sessionId);
  if (!r) return { ok: false, error: 'Commande introuvable' };
  if (r.attente) return { ok: false, attente: true };
  return { ok: true, commande: r };
}

/** Lancé automatiquement toutes les 5 minutes : rattrape les clients qui ont fermé la page trop tôt. */
function syncPaiements() {
  var depuis = Math.floor(Date.now() / 1000) - 3 * 24 * 3600;
  var deja = {};
  feuille_().getDataRange().getValues().slice(1).forEach(function (l) { deja[l[COL['Session Stripe']]] = true; });
  var liste = stripe_('get', '/v1/checkout/sessions', { limit: 100, status: 'complete', created: { gte: depuis } });
  liste.data.forEach(function (s) {
    if (s.metadata && s.metadata.source === SOURCE && s.payment_status === 'paid' && !deja[s.id]) {
      traiterSession_(s.id);
    }
  });
}

function traiterSession_(sessionId) {
  var s = stripe_('get', '/v1/checkout/sessions/' + sessionId);
  if (!s.metadata || s.metadata.source !== SOURCE) return null;
  if (s.payment_status !== 'paid') return { attente: true };

  var verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  var commande, nouvelle = false;
  try {
    var sh = feuille_();
    var existante = chercher_(sh, function (l) { return l[COL['Session Stripe']] === sessionId; });
    if (existante) return versCommande_(existante.ligne);

    var articles = String(s.metadata.articles || '').split(',').map(function (x) {
      var p = x.split(':'); return { taille: p[0], qte: Number(p[1]) };
    });
    var cd = s.customer_details || {};
    var numero = 'T-' + ('000' + sh.getLastRow()).slice(-4);
    var ligne = [];
    ligne[COL['Date']] = new Date();
    ligne[COL['N° commande']] = numero;
    ligne[COL['Nom']] = cd.name || '';
    ligne[COL['E-mail']] = cd.email || '';
    ligne[COL['Téléphone']] = cd.phone || '';
    ligne[COL['Articles']] = articles.map(function (a) { return a.taille + ' ×' + a.qte; }).join(', ');
    ligne[COL['Nb t-shirts']] = articles.reduce(function (t, a) { return t + a.qte; }, 0);
    ligne[COL['Sous-total (€)']] = (s.amount_subtotal || 0) / 100;
    ligne[COL['Remise (€)']] = ((s.total_details && s.total_details.amount_discount) || 0) / 100;
    ligne[COL['Code promo']] = codePromo_(s);
    ligne[COL['Total payé (€)']] = (s.amount_total || 0) / 100;
    ligne[COL['Statut']] = 'À remettre';
    ligne[COL['Remis le']] = '';
    ligne[COL['E-mail envoyé']] = '…';
    ligne[COL['Code QR']] = Utilities.getUuid().replace(/-/g, '').toUpperCase();
    ligne[COL['Session Stripe']] = sessionId;
    sh.appendRow(ligne);
    SpreadsheetApp.flush();
    commande = versCommande_(ligne);
    commande._row = sh.getLastRow();
    nouvelle = true;
  } finally {
    verrou.releaseLock();
  }

  if (nouvelle) {
    var etat = 'Oui';
    try { envoyerEmail_(commande); } catch (err) { console.error(err); etat = 'ERREUR : ' + err.message; }
    feuille_().getRange(commande._row, COL['E-mail envoyé'] + 1).setValue(etat);
  }
  return commande;
}

function codePromo_(s) {
  try {
    var d = (s.discounts || [])[0];
    if (!d || !d.promotion_code) return '';
    var id = typeof d.promotion_code === 'string' ? d.promotion_code : d.promotion_code.id;
    return stripe_('get', '/v1/promotion_codes/' + id).code || '';
  } catch (err) { return ''; }
}

// ---------------------------------------------------------------- 3. E-mail avec QR code

function envoyerEmail_(c) {
  if (!c.email) throw new Error('pas d’adresse e-mail');
  var qr = UrlFetchApp.fetch('https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=24&data=' +
    encodeURIComponent(c.token)).getBlob().setName('QR-' + c.numero + '.png');
  var prenom = String(c.nom || '').split(' ')[0];
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#161514">' +
    '<p style="font-weight:900;letter-spacing:2px;text-transform:uppercase">' + esc_(PRODUIT.boutique) + '</p>' +
    '<h1 style="font-size:24px;margin:0 0 8px">Merci' + (prenom ? ' ' + esc_(prenom) : '') + ' !</h1>' +
    '<p>Ta précommande <b>' + esc_(c.numero) + '</b> est bien confirmée.</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:12px 0">' +
    '<tr><td style="padding:6px 0;color:#6b6760">Article</td><td style="text-align:right">' + esc_(PRODUIT.nom) + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#6b6760">Taille(s)</td><td style="text-align:right"><b>' + esc_(c.articles) + '</b></td></tr>' +
    '<tr><td style="padding:6px 0;color:#6b6760">Total payé</td><td style="text-align:right">' + c.total.toFixed(2).replace('.', ',') + ' €</td></tr>' +
    '</table>' +
    '<div style="text-align:center;margin:20px 0"><img src="cid:qr" width="260" height="260" alt="QR code"></div>' +
    '<p style="background:#f3f0e9;padding:12px;border-radius:8px">' + esc_(PRODUIT.retrait) +
    '<br><b>Ce QR code ne fonctionne qu’une seule fois : ne le partage pas.</b></p>' +
    '<p style="color:#6b6760;font-size:13px">Une question ? Réponds simplement à cet e-mail.</p></div>';

  MailApp.sendEmail({
    to: c.email,
    subject: 'Ta précommande ' + c.numero + ' — ton QR code',
    htmlBody: html,
    body: 'Ta précommande ' + c.numero + ' (' + c.articles + ') est confirmée. Ton QR code est en pièce jointe. ' + PRODUIT.retrait,
    name: PRODUIT.boutique,
    replyTo: PRODUIT.contact,
    inlineImages: { qr: qr },
    attachments: [qr.copyBlob()],
  });
}

// ---------------------------------------------------------------- 4. Scanner (soirée)

function scanner_(code, pin, annuler) {
  var bon = prop_('STAFF_PIN');
  if (String(pin) !== String(bon)) return { ok: false, erreurPin: true };
  code = String(code || '').trim().toUpperCase();
  if (!code) return { ok: false, statut: 'inconnu' };

  var verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    var sh = feuille_();
    var trouve = chercher_(sh, function (l) {
      return String(l[COL['Code QR']]).toUpperCase() === code || String(l[COL['N° commande']]).toUpperCase() === code;
    });
    if (!trouve) return { ok: false, statut: 'inconnu', stats: stats_(sh) };

    var l = trouve.ligne, statut = l[COL['Statut']];
    var cellStatut = sh.getRange(trouve.row, COL['Statut'] + 1);
    var cellDate = sh.getRange(trouve.row, COL['Remis le'] + 1);

    if (annuler) {
      cellStatut.setValue('À remettre'); cellDate.setValue('');
      SpreadsheetApp.flush();
      return { ok: true, annule: true, commande: versCommande_(l), stats: stats_(sh) };
    }
    if (statut === 'Remis') return { ok: true, deja: true, commande: versCommande_(l), stats: stats_(sh) };
    if (statut !== 'À remettre') {
      return { ok: false, statut: 'bloque', error: 'Commande « ' + statut + ' »', commande: versCommande_(l), stats: stats_(sh) };
    }
    var maintenant = new Date();
    cellStatut.setValue('Remis'); cellDate.setValue(maintenant);
    SpreadsheetApp.flush();
    l[COL['Statut']] = 'Remis'; l[COL['Remis le']] = maintenant;
    return { ok: true, deja: false, commande: versCommande_(l), stats: stats_(sh) };
  } finally {
    verrou.releaseLock();
  }
}

function stats_(sh) {
  var lignes = sh.getDataRange().getValues().slice(1);
  return {
    total: lignes.length,
    remises: lignes.filter(function (l) { return l[COL['Statut']] === 'Remis'; }).length,
  };
}

// ---------------------------------------------------------------- Installation & menu

/** À lancer UNE fois (bouton ▶ Exécuter) : crée l'onglet, le rafraîchissement auto et demande les autorisations. */
function installer() {
  ['STRIPE_SECRET_KEY', 'STAFF_PIN', 'SITE_URL'].forEach(prop_);
  var sh = feuille_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncPaiements') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncPaiements').timeBased().everyMinutes(5).create();
  stripe_('get', '/v1/checkout/sessions', { limit: 1 }); // vérifie la clé Stripe
  console.log('✅ Installation terminée. Onglet « ' + sh.getName() + ' » prêt, clé Stripe valide.');
}

/** Envoie un e-mail d'exemple à ton adresse pour voir le rendu. */
function testerEmail() {
  envoyerEmail_({
    numero: 'T-0000', nom: 'Test Exemple', email: Session.getEffectiveUser().getEmail(),
    articles: 'M ×1, L ×2', total: 75, token: 'TEST-QR-CODE',
  });
  console.log('E-mail de test envoyé à ' + Session.getEffectiveUser().getEmail());
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Boutique')
    .addItem('Renvoyer l’e-mail de la ligne sélectionnée', 'renvoyerEmail')
    .addItem('Récupérer les paiements maintenant', 'syncPaiements')
    .addToUi();
}

function renvoyerEmail() {
  var sh = feuille_(), row = sh.getActiveRange().getRow();
  if (row < 2) return SpreadsheetApp.getUi().alert('Sélectionne une ligne de commande.');
  var l = sh.getRange(row, 1, 1, COLONNES.length).getValues()[0];
  envoyerEmail_(versCommande_(l));
  sh.getRange(row, COL['E-mail envoyé'] + 1).setValue('Oui (renvoyé)');
  SpreadsheetApp.getUi().alert('E-mail renvoyé à ' + l[COL['E-mail']]);
}

// ---------------------------------------------------------------- Outils

function feuille_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ONGLET);
  if (!sh) {
    sh = ss.insertSheet(ONGLET);
    sh.getRange(1, 1, 1, COLONNES.length).setValues([COLONNES]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('dd/mm/yyyy hh:mm');
    sh.getRange(1, COL['Remis le'] + 1, 1000).setNumberFormat('dd/mm/yyyy hh:mm');
  }
  return sh;
}

function chercher_(sh, test) {
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (test(v[i])) return { row: i + 1, ligne: v[i] };
  return null;
}

function versCommande_(l) {
  var remis = l[COL['Remis le']];
  return {
    numero: l[COL['N° commande']], nom: l[COL['Nom']], email: l[COL['E-mail']],
    articles: l[COL['Articles']], total: Number(l[COL['Total payé (€)']]) || 0,
    statut: l[COL['Statut']], remisLe: remis instanceof Date ? remis.toISOString() : '',
    token: l[COL['Code QR']],
  };
}

function prop_(nom) {
  var v = PropertiesService.getScriptProperties().getProperty(nom);
  if (!v) throw new Error('Propriété du script manquante : ' + nom);
  return v;
}

function stripe_(methode, chemin, params) {
  var url = 'https://api.stripe.com' + chemin;
  var options = {
    method: methode,
    headers: { Authorization: 'Bearer ' + prop_('STRIPE_SECRET_KEY') },
    muteHttpExceptions: true,
  };
  if (params && methode === 'get') url += '?' + form_(params);
  else if (params) options.payload = form_(params);
  var rep = JSON.parse(UrlFetchApp.fetch(url, options).getContentText());
  if (rep.error) throw new Error('Stripe : ' + rep.error.message);
  return rep;
}

/** Transforme un objet en paramètres Stripe : a[b][0][c]=valeur */
function form_(obj, prefixe, out) {
  out = out || [];
  Object.keys(obj).forEach(function (k) {
    var v = obj[k], cle = prefixe ? prefixe + '[' + k + ']' : k;
    if (v === undefined || v === null) return;
    if (typeof v === 'object') form_(v, cle, out);
    else out.push(encodeURIComponent(cle) + '=' + encodeURIComponent(v));
  });
  return out.join('&');
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

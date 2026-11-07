# Boutique de précommande — guide de mise en route

## Comment ça marche

```
Instagram ──▶ page boutique (GitHub Pages)
                │  le client choisit taille + quantité
                ▼
          script Google ──▶ page de paiement Stripe (carte, Apple Pay, Google Pay, codes promo)
                                │ paiement OK
                                ▼
          script Google ──▶ ligne ajoutée dans le Google Sheets « Commandes »
                        └─▶ e-mail au client avec son QR code
Soirée :  page scan.html (téléphone de l'équipe) ──▶ script Google ──▶ « À remettre » ✅ ou « Déjà remis » ⛔
```

| Fichier | Rôle |
|---|---|
| `index.html` | Page produit (lien à mettre dans la bio Instagram) |
| `merci.html` | Page affichée après le paiement, avec le QR code |
| `scan.html` | Page de l'équipe pour scanner les QR à la soirée (protégée par un code) |
| `config.js` | **Textes, prix, tailles, photos** → le seul fichier à modifier pour le contenu |
| `apps-script/Code.gs` | Le « cerveau » : paiement, Google Sheets, e-mails, scan |

Tant que `API_URL` est vide dans `config.js`, le site est en **mode démo** : on peut tout tester sans payer.

---

## Combien ça coûte

| Poste | Prix |
|---|---|
| Hébergement de la page (GitHub Pages) | **0 €** |
| Google Sheets + script + envoi des e-mails | **0 €** (limite Gmail gratuite : ~100 e-mails/jour) |
| Stripe (paiement) | **0 € d'abonnement**, commission par vente : ~1,5 % + 0,25 € (carte européenne) → **≈ 0,63 € sur un t-shirt à 25 €** |
| Nom de domaine perso (facultatif, ex. `boutique-versatyl.fr`) | ~10 €/an |

Pas de frais fixes : tu ne paies que la commission Stripe sur ce que tu vends.
(Vérifie les tarifs à jour sur stripe.com/fr/pricing.)

---

## Mise en place (≈ 30 min, une seule fois)

### 1. Créer le compte Stripe
1. Va sur **stripe.com** → crée un compte (il faudra un IBAN pour recevoir l'argent, et indiquer le statut : particulier, auto-entreprise ou association).
2. Laisse le **mode Test** activé (interrupteur en haut) pour commencer.
3. Menu **Développeurs → Clés API** → copie la **clé secrète** (`sk_test_...`). Ne la mets jamais dans le site, seulement dans le script Google.

### 2. Créer le Google Sheets et coller le script
1. Sur Google Drive : **Nouveau → Google Sheets**, nomme-le « Précommandes T-shirt ».
2. Menu **Extensions → Apps Script**.
3. Efface le contenu de `Code.gs` et colle tout le fichier `apps-script/Code.gs`.
4. En haut du script, vérifie le bloc `PRODUIT` (nom, prix en centimes, tailles, date de fin, texte de retrait, e-mail de contact). Il doit correspondre à `config.js`.
5. Clique sur 💾 Enregistrer.

### 3. Renseigner les réglages secrets
Dans Apps Script : **⚙️ Paramètres du projet → Propriétés du script → Ajouter** :

| Propriété | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | ta clé `sk_test_...` |
| `STAFF_PIN` | un code pour l'équipe, 6 chiffres ou plus (ex. `482913`) |
| `SITE_URL` | l'adresse de la boutique **terminée par /** (voir étape 6) |

### 4. Lancer l'installation
1. Dans l'éditeur, choisis la fonction **`installer`** dans la liste en haut → **▶ Exécuter**.
2. Google demande des autorisations → accepte (c'est ton propre script ; clique sur « Paramètres avancés → Accéder au projet » si un avertissement s'affiche).
3. Le journal doit afficher « ✅ Installation terminée ». L'onglet **Commandes** apparaît dans le Sheets.
4. Facultatif : exécute **`testerEmail`** pour recevoir un e-mail d'exemple et voir le rendu.

### 5. Publier le script
1. **Déployer → Nouveau déploiement** → type **Application Web**.
2. *Exécuter en tant que* : **Moi** — *Qui a accès* : **Tout le monde**.
3. Copie l'**URL de l'application Web** (finit par `/exec`) et colle-la dans `config.js` → `API_URL: 'https://script.google.com/macros/s/.../exec'`.

> Si tu modifies le script plus tard : **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version**, sinon l'ancienne version continue de tourner.

### 6. Mettre la page en ligne
La boutique est dans le dossier `boutique/` du site déjà publié sur GitHub Pages. Une fois poussée, elle sera à l'adresse :
`https://<ton-pseudo>.github.io/<nom-du-dépôt>/boutique/`
C'est cette adresse qu'il faut mettre dans `SITE_URL` (étape 3) et dans la bio Instagram.

### 7. Créer les codes promo
Dans Stripe : **Catalogue de produits → Coupons → Créer un coupon** (ex. −20 % ou −5 €), puis dans le coupon **Ajouter un code promotionnel** (ex. `SOIREE20`).
Tu peux limiter le nombre d'utilisations, la date d'expiration, ou réserver le code à une première commande. Le client le tape sur la page de paiement, et le code utilisé apparaît dans la colonne « Code promo » du Sheets.

### 8. Tester de bout en bout (mode Test)
1. Ouvre la boutique, ajoute un t-shirt, paie avec la carte de test **4242 4242 4242 4242**, date future quelconque, CVC `123`.
2. Vérifie : la page « Merci » affiche le QR, une ligne apparaît dans le Sheets, l'e-mail arrive.
3. Ouvre `scan.html` sur un autre téléphone, tape le code équipe, scanne le QR → vert « À remettre ». Rescanne → rouge « Déjà remis ».
4. Supprime les lignes de test du Sheets avant le lancement.

### 9. Passer en vrai
1. Dans Stripe, active ton compte (infos d'identité + IBAN) et désactive le mode Test.
2. Copie la clé **`sk_live_...`** et remplace `STRIPE_SECRET_KEY` dans les propriétés du script. C'est tout.

---

## Le soir de la soirée
- Ouvre `.../boutique/scan.html` sur 1 ou plusieurs téléphones (le code équipe est demandé une fois).
- **Vert « À remettre »** : donne les tailles affichées en gros. La commande est marquée « Remis » immédiatement, sur tous les téléphones.
- **Rouge « Déjà remis »** : affiche l'heure à laquelle il a été donné → on ne donne rien.
- Client sans téléphone / e-mail perdu : cherche son nom dans le Sheets et tape son n° de commande (ex. `T-0007`) dans le champ sous la caméra.
- Erreur de manip : bouton « Annuler cette remise ».
- Une remise annulée ou un remboursement : écris `Remboursé` dans la colonne Statut du Sheets → le QR sera refusé.

## À savoir
- Vente à distance = **droit de rétractation de 14 jours** pour le client ; il est rappelé dans les conditions de la page.
- Si les ventes deviennent régulières, il faut un cadre (association ou micro-entreprise) : à vérifier de ton côté.
- Menu **Boutique** dans le Sheets : renvoyer l'e-mail d'un client, ou forcer la récupération des paiements.

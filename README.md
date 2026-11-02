# Versatyl Planning

Planning d'équipe façon Skello, aux couleurs de la DA Versatyl : planning par personne, deadlines, tâches, registre du personnel et rappels automatiques.

**Site en ligne :** https://fbastide67.github.io/versatyl-planning/

## Fonctionnalités

- **Comptes** : à la première visite, chacun crée son compte (identifiant + mot de passe) puis se connecte simplement avec son identifiant. Le premier inscrit devient administrateur.
- **Planning** (jour / semaine / mois) : une ligne par personne et une ligne « Toute l'équipe ». On clique sur une case pour ajouter un élément.
- **Événements, tâches, deadlines** : chacun peut en créer librement. On ne peut **modifier ou supprimer que les siens**. Les personnes concernées peuvent cocher une tâche ou une deadline comme terminée.
- **Rappels** : à l'approche d'une échéance (1 semaine, 3 jours, 1 jour, 2 h, 1 h ou 30 min avant, au choix), les personnes concernées sont prévenues :
  - dans le site (cloche + pop-up),
  - par notification sur leur téléphone ou leur ordinateur (à activer dans *Mon profil*),
  - par e-mail.
- **Registre du personnel** : poste attribué, contrat, date d'arrivée, e-mail et téléphone de chacun (copie, appel, mail, fiche contact .vcf), export Excel (CSV). Les administrateurs attribuent les postes et peuvent réinitialiser un mot de passe.
- Thème clair / sombre, version mobile (installable sur l'écran d'accueil), animations reprises de la DA.

## Mode démo et mode partagé

Tant que Supabase n'est pas branché, le site tourne en **mode démo** : tout est enregistré **uniquement dans le navigateur** de la personne (bandeau jaune en haut). Pour que toute l'équipe partage les mêmes comptes et le même planning, il faut brancher une base de données gratuite Supabase (environ 5 minutes).

### 1. Brancher Supabase (base de données partagée)

1. Va sur https://supabase.com, clique **Start your project** et connecte-toi avec ton compte GitHub.
2. **New project** : nom `versatyl-planning`, choisis un mot de passe de base de données (garde-le de côté), région **West EU (Paris)**, puis **Create new project**.
3. Une fois le projet prêt : menu de gauche **SQL Editor** > **New query**, colle tout le contenu du fichier [`supabase/schema.sql`](supabase/schema.sql), puis **Run**. Le message doit être « Success ».
4. Menu **Project Settings** > **API** (ou **Data API**) : copie la **Project URL** et la clé **anon public**.
5. Sur GitHub, ouvre [`js/config.js`](js/config.js), clique sur le crayon ✏️ et colle les deux valeurs :
   ```js
   supabaseUrl: 'https://xxxxxxxx.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi...',
   ```
   puis **Commit changes**. Le site se met à jour tout seul en 1 à 2 minutes.

> La clé « anon public » est faite pour être publique : pas de souci à la mettre dans le code.

### 2. Activer les e-mails de rappel

Les rappels sont envoyés par une tâche automatique GitHub Actions qui tourne toutes les 15 minutes ([`.github/workflows/reminders.yml`](.github/workflows/reminders.yml)). Pour les e-mails, il lui faut une adresse d'envoi. Avec Gmail :

1. Active la validation en deux étapes sur le compte Google qui enverra les mails.
2. Crée un **mot de passe d'application** : https://myaccount.google.com/apppasswords (nom : « Versatyl Planning »). Google affiche un code de 16 lettres.
3. Sur GitHub : dépôt > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**, et crée :
   - `SMTP_USER` : l'adresse Gmail (ex. `planning.versatyl@gmail.com`)
   - `SMTP_PASS` : le code de 16 lettres

Pour un autre fournisseur que Gmail, ajoute aussi `SMTP_HOST`, `SMTP_PORT` (et éventuellement `MAIL_FROM`).

Pour vérifier : onglet **Actions** > **Rappels deadlines** > **Run workflow**, puis ouvre l'exécution pour lire le journal.

### 3. Notifications sur téléphone / ordinateur

Déjà configuré (le secret `VAPID_PRIVATE_KEY` est en place sur le dépôt). Chaque personne clique sur **Activer** dans *Mon profil* > *Notifications*.
Sur iPhone : ouvrir le site dans Safari > Partager > **Sur l'écran d'accueil**, puis activer les notifications depuis l'app installée.

## Bon à savoir

- **Sécurité volontairement légère** : connexion par identifiant et mot de passe, sans vérification d'e-mail. Les mots de passe ne sont jamais stockés en clair, et seuls les créateurs peuvent modifier ou supprimer leurs éléments (contrôlé côté base de données). Mais le planning et l'annuaire sont lisibles par toute personne qui connaît l'adresse du site et sait utiliser l'API : n'y mets pas d'informations sensibles.
- **Mot de passe oublié** : un administrateur le réinitialise depuis la fiche de la personne dans *Équipe*.
- Supabase (gratuit) met en pause un projet inactif pendant 7 jours. La tâche de rappels le sollicite toutes les 15 minutes, ce qui le garde actif.
- GitHub désactive les tâches planifiées d'un dépôt sans aucun commit pendant 60 jours : si les rappels s'arrêtent, onglet **Actions** > **Rappels deadlines** > **Enable workflow**.
- Les postes proposés à l'inscription se modifient dans `js/config.js` (`roles`).

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html`, `css/app.css` | Page et styles (DA, animations) |
| `js/app.js` | Démarrage, navigation, notifications, mises à jour en direct |
| `js/views/` | Écrans : connexion, planning, deadlines, équipe, profil, fiche événement |
| `js/store.js` | Accès aux données (Supabase ou mode démo) |
| `supabase/schema.sql` | Tables, droits et fonctions de la base |
| `scripts/reminders.mjs` | Envoi des rappels par e-mail et push (GitHub Actions) |
| `assets/` | Logo, mascotte, icônes et vidéos de la DA |

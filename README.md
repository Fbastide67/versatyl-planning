# Versatyl Planning

Planning d'équipe façon Skello, aux couleurs de la DA Versatyl : planning par personne, deadlines, tâches, registre du personnel et rappels sur téléphone.

**Site en ligne :** https://fbastide67.github.io/versatyl-planning/

## Fonctionnalités

- **Comptes** : à la première visite, chacun crée son compte (identifiant + mot de passe) puis se connecte simplement avec son identifiant. Le premier inscrit devient administrateur.
- **Planning** (jour / semaine / mois) : une ligne par personne et une ligne « Toute l'équipe ». On clique sur une case pour ajouter un élément.
- **Événements, tâches, deadlines** : chacun peut en créer librement. On ne peut **modifier ou supprimer que les siens**. Les personnes concernées peuvent cocher une tâche ou une deadline comme terminée.
- **Rappels** : à l'approche d'une échéance (1 semaine, 3 jours, 1 jour, 2 h, 1 h ou 30 min avant, au choix), les personnes concernées reçoivent une **notification sur leur téléphone ou leur ordinateur**, ainsi que dans le site (cloche + pop-up). Elles sont aussi prévenues quand on les ajoute à un élément, quand l'horaire change ou quand il est annulé.
- **Registre du personnel** : poste attribué, contrat, date d'arrivée, téléphone et e-mail de chacun (copie, appel, mail, fiche contact .vcf), export Excel (CSV). Les administrateurs attribuent les postes et peuvent réinitialiser un mot de passe.
- Thème clair / sombre, version mobile installable sur l'écran d'accueil, animations reprises de la DA.

## Activer les notifications (chaque membre de l'équipe)

- **Android / ordinateur** : ouvrir le site, se connecter, puis toucher **Activer** dans le bandeau violet (ou *Mon profil* > *Notifications*) et accepter.
- **iPhone** : ouvrir le site dans **Safari** > bouton **Partager** > **Sur l'écran d'accueil**. Ouvrir ensuite Versatyl depuis la nouvelle icône, se connecter et toucher **Activer**.

Les rappels sont envoyés par une tâche automatique GitHub Actions toutes les 15 minutes ([`.github/workflows/reminders.yml`](.github/workflows/reminders.yml)) : une notification peut donc arriver avec quelques minutes de décalage.

## Base de données (déjà branchée)

Les données sont dans le projet Supabase gratuit **versatyl-planning** (organisation Versatyl), relié au site par [`js/config.js`](js/config.js). Le schéma est dans [`supabase/schema.sql`](supabase/schema.sql) : on peut le relancer sans risque dans Supabase > SQL Editor après une mise à jour.

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
| `js/store.js` | Accès aux données (Supabase, ou mode démo local si non configuré) |
| `supabase/schema.sql` | Tables, droits et fonctions de la base |
| `scripts/reminders.mjs` | Envoi des rappels en notifications push (GitHub Actions) |
| `assets/` | Logo, mascotte, icônes et vidéos de la DA |

# CoachBoard U18

Application PWA mobile-first de gestion d'équipe de football. Elle peut fonctionner en mode démo local, ou être synchronisée en temps réel avec Firebase.

## Démarrage

```bash
npm install
npm run dev
```

Pour vérifier la version de production :

```bash
npm run build
npm run preview
```

Pour vérifier le calcul du classement et la synchronisation des résultats :

```bash
npm test
```

## Championnat

Chaque équipe peut gérer ses championnats, les équipes participantes, les journées et leurs scores. Les rencontres de l'équipe du coach peuvent être rattachées à un match existant ou créer un match à compléter. Les résultats sont synchronisés entre la journée et le bilan, sans effacer les événements joueurs. La suppression d'une rencontre ou d'une journée conserve les matchs liés dans l'onglet Matchs.

Les points et certains critères de départage sont configurables. Le classement est calculé depuis les scores saisis : les pénalités, forfaits et confrontations directes ne sont pas calculés automatiquement et peuvent expliquer un écart avec un classement officiel.

## Firebase configuré

Le projet Firebase **CoachBoard U18** (`coachboard-u18`) est déjà créé avec :

- Cloud Firestore, région `eur3` (Europe) ;
- Firebase Authentication avec comptes e-mail / mot de passe ;
- un profil privé dans `users/{uid}`, une équipe historique dans `teams/{uid}` et les équipes supplémentaires dans `users/{uid}/teams/{teamId}` ;
- règles de sécurité reproductibles dans `firestore.rules`.

La configuration locale se trouve dans `.env.local` (non versionné). Pour un autre environnement, copiez `.env.example` et remplissez les valeurs du SDK Web Firebase. Activez le fournisseur **E-mail/Mot de passe** dans Firebase Authentication avant le déploiement et ajoutez le domaine de production dans **Authorized domains**.

À la première inscription, le coach renseigne son prénom, son nom et sa première équipe. Il peut ensuite créer plusieurs équipes privées, changer d'équipe depuis l'en-tête, et retrouver ses données sur ses appareils. L'équipe historique reste dans son document d'origine ; aucune copie ni suppression n'est nécessaire. Les profils existants sont invités à compléter leur nom à leur prochaine connexion. Le partage avec le staff nécessitera un futur système d’invitations.

Les anciennes équipes créées avec une session anonyme sont conservées : lors de leur prochaine ouverture, l’application demande d’y associer une adresse e-mail et un mot de passe afin de conserver ces données et de les rendre accessibles sur plusieurs appareils.

Pour déployer sur Vercel, renseignez les mêmes variables `VITE_FIREBASE_*` dans les variables d'environnement du projet, puis déployez normalement.

Avant de déployer une version utilisant les profils et plusieurs équipes, publiez d'abord les règles contenues dans `firestore.rules` dans Firebase Console → Firestore Database → Règles. Les règles précédentes ne permettent pas encore l'accès aux profils ni aux équipes supplémentaires ; leur publication est nécessaire au fonctionnement de cette version. Vérifiez ensuite l'inscription, la connexion et les changements d'équipe avec un compte de test.

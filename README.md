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

## Firebase configuré

Le projet Firebase **CoachBoard U18** (`coachboard-u18`) est déjà créé avec :

- Cloud Firestore, région `eur3` (Europe) ;
- Firebase Authentication avec comptes e-mail / mot de passe ;
- un document d'équipe privé par coach dans `teams/{uid}` ;
- règles de sécurité reproductibles dans `firestore.rules`.

La configuration locale se trouve dans `.env.local` (non versionné). Pour un autre environnement, copiez `.env.example` et remplissez les valeurs du SDK Web Firebase. Activez le fournisseur **E-mail/Mot de passe** dans Firebase Authentication avant le déploiement et ajoutez le domaine de production dans **Authorized domains**.

À la première inscription, l'application crée une équipe vide puis guide le coach dans sa configuration. Le même compte e-mail permet de retrouver l'équipe sur tous ses appareils. Chaque compte possède pour l’instant sa propre équipe ; le partage avec le staff nécessitera un futur système d’invitations.

Les anciennes équipes créées avec une session anonyme sont conservées : lors de leur prochaine ouverture, l’application demande d’y associer une adresse e-mail et un mot de passe afin de conserver ces données et de les rendre accessibles sur plusieurs appareils.

Pour déployer sur Vercel, renseignez les mêmes variables `VITE_FIREBASE_*` dans les variables d'environnement du projet, puis déployez normalement.

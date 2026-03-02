# NIVELR Mobile (Expo)

Application mobile separee du site web, connectee au meme backend Supabase pour conserver les memes comptes et la meme progression.

## 1) Installation

```bash
cd /Users/benjaminlevisse/Documents/PWA/mobile-app
npm install
```

## 2) Variables d'environnement

Creer un fichier `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

Renseigner:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Ces valeurs doivent etre les memes que le web.

## 3) Lancer l'app

```bash
npm run start
```

Puis:
- scanner le QR code avec Expo Go (iOS/Android), ou
- `npm run ios`, ou
- `npm run android`

## 4) Fonctionnel V1

- Auth email/password via Supabase
- Chargement de l'etat utilisateur depuis `user_app_state.state_json`
- Ajout/suppression de seance
- Calcul XP identique a la logique web
- Sauvegarde cloud dans `user_app_state` (meme compte = memes donnees web/mobile)

## 5) Important

Le projet web n'est pas modifie par ce dossier mobile.

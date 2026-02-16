# NIVELR - Mise en ligne (guide simple)

## Objectif
Publier le site rapidement, sans backend obligatoire au départ, en conservant le fonctionnement actuel (LocalStorage).

## Option recommandée (débutant): Vercel (gratuit)

## 1) Préparation locale (déjà faite)
- Routing SPA prêt (`vercel.json` ajouté)
- Build validé

## 2) Mettre le code sur GitHub
1. Créer un repo GitHub (ex: `nivelr-app`)
2. Envoyer le projet dessus

## 3) Déployer sur Vercel
1. Aller sur https://vercel.com
2. Se connecter avec GitHub
3. `Add New Project`
4. Sélectionner le repo `nivelr-app`
5. Framework détecté: `Vite`
6. Build command: `npm run build`
7. Output directory: `dist`
8. Cliquer `Deploy`

## 4) Vérifier
- Ouvrir l’URL Vercel
- Tester les routes:
  - `/`
  - `/missions`
  - `/season`
  - `/guide-xp`
- Recharger une page interne (ex: `/missions`) pour vérifier qu’il n’y a pas de 404

## 5) Domaine personnalisé (optionnel)
1. Dans Vercel > Project > Settings > Domains
2. Ajouter ton domaine
3. Suivre les DNS indiqués

---

## Option 2: Netlify (gratuit)
- `netlify.toml` est déjà prêt.
- Procédure:
  1. Créer un site depuis Git
  2. Build command: `npm run build`
  3. Publish directory: `dist`
  4. Deploy

---

## Important (phase actuelle)
- Pas de backend obligatoire pour le lancement.
- Les données restent sur l’appareil utilisateur (LocalStorage).
- Tant que la couche backend n’est pas activée, aucun risque de migration.

---

## Prochaine étape après mise en ligne
- Activer la phase backend safe:
  - Auth (`/connexion`)
  - Profil (`/profil`)
  - Utilisateurs/contact (`/utilisateurs`)
  - Abonnement (`/abonnement`)
- Documents de référence:
  - `docs/backend/safe-migration-plan.md`
  - `docs/backend/nivelr-schema-v1.sql`

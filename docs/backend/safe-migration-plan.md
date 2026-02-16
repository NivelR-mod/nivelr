# NIVELR - Plan de migration safe (LocalStorage -> Backend)

## Objectif
Ajouter `Connexion`, `Profil`, `Abonnement`, `Recherche utilisateur`, `Contact utilisateur` sans casser l'app actuelle.

## Principes de securite
- Ne pas supprimer le mode LocalStorage existant.
- Ajouter le backend en surcouche via feature flag.
- Faire des exports JSON avant chaque etape sensible.
- Possibilite de rollback immediat vers LocalStorage only.

## Feature flags recommandes
- `VITE_BACKEND_ENABLED=false` (par defaut)
- `VITE_AUTH_ENABLED=false`
- `VITE_SUBSCRIPTION_ENABLED=false`
- `VITE_SOCIAL_ENABLED=false`

## Phases

### Phase 0 - Backup et observabilite (safe)
- Conserver `Export JSON` comme backup manuel.
- Ajouter un ecran admin local (optionnel) qui affiche:
  - version schema backend
  - etat des flags
  - timestamp du dernier export

### Phase 1 - Base backend en parallele
- Creer schema SQL initial (`docs/backend/nivelr-schema-v1.sql`).
- Deployer backend (ex: Supabase).
- Aucune lecture backend en production app tant que `VITE_BACKEND_ENABLED=false`.

### Phase 2 - Auth uniquement
- Activer `VITE_AUTH_ENABLED=true`.
- Ajouter pages:
  - `/connexion`
  - `/inscription`
  - `/mot-de-passe-oublie`
- Le coeur produit continue de tourner localement.

### Phase 3 - Profil utilisateur
- Synchroniser profil de base:
  - `display_name`, `handle`, `avatar_url`, `bio`.
- Garder les sessions/XP encore en LocalStorage.

### Phase 4 - Social cooperatif
- Activer `VITE_SOCIAL_ENABLED=true`.
- Ajouter:
  - recherche utilisateur (handle)
  - demandes de contact (accept/refuse)
  - invitations d'equipe

### Phase 5 - Abonnement
- Activer `VITE_SUBSCRIPTION_ENABLED=true`.
- Saison 1 gratuite via `is_free_season=true` cote backend.
- Integrer Stripe plus tard sans bloquer les utilisateurs actuels.

### Phase 6 - Migration donnees sport/gamification
- Double ecriture (LocalStorage + backend) pendant une periode de transition.
- Validation de coherence (totaux XP, missions, niveau).
- Basculer progressivement les lectures vers backend.

## Rollback
- Si regression:
  - repasser `VITE_BACKEND_ENABLED=false`
  - conserver le flux LocalStorage natif
  - aucune perte si export JSON prealable

## Checklist avant chaque activation de phase
- [ ] Export JSON complet realise
- [ ] Flag active uniquement dans env de test
- [ ] Verification manuelle: ajout seance / mission / objectif / saison
- [ ] Verification ecran mobile
- [ ] Plan de rollback documente

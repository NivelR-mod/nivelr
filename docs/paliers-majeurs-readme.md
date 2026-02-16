# PaceQuest - Paliers Majeurs V1

## Objectif
Implémentation non destructive des paliers 5/10/15/20/25/30 avec fonctionnalités avancées en surcouche gamification.

## Fichiers clés
- `src/gamification/types.ts`: modèle de données étendu (titre, défis mensuels, goal 8 semaines, hall of fame, prestige).
- `src/gamification/challengeOptions.ts`: bibliothèque de 18 défis mensuels.
- `src/gamification/progression.ts`: services de calcul (weekly load, active/balanced weeks, défis mensuels, objectif 8 semaines, prestige).
- `src/gamification/storage.ts`: persistance LocalStorage des nouveaux champs.
- `src/gamification/api.ts`: endpoints locaux (choose challenge, set title, start 8-week goal, prestige).
- `src/app/routes/Progression.tsx`: UI avancée en onglets secondaires.

## Règles implémentées
- Niveau 5: charge hebdomadaire visible (sinon verrouillée côté Home).
- Niveau 10: défis mensuels (3 choix/mois, 1 verrouillé une fois choisi).
- Niveau 15: style utilisateur (1 changement max / mois).
- Niveau 20: objectif personnel 8 semaines.
- Niveau 25: Hall of Fame en mode archive (pas de leaderboard live).
- Niveau 30: action Prestige.

## Défis mensuels
- Récompenses configurées dans `src/gamification/challengeOptions.ts`:
  - Standard: 250 XP
  - Avancé: 450 XP
  - Expert: 700 XP
- Sélection mensuelle:
  - 1 défi Standard
  - 1 défi Avancé
  - 1 défi Expert
- Exclusions:
  - `A6` non proposé sans mois précédent exploitable.
  - `E6` non proposé sans historique suffisant.

## Hall of Fame (anti-toxique)
- Aucune exposition de classement live.
- Publication uniquement en archive (saison terminée / rollover).

## Configurable
Dans `src/gamification/config.ts`:
- `weeklyXpCap`
- `maxXpSessionsPerDay`
- `seasonDurationWeeks`
- `seasonCarryOverRatio`
- `prestigeKeepXp`
- `prestigePermanentBonusPercent`

## Notes d’intégration
- Le module reste découplé: si `enabled=false`, le cœur sessions continue de fonctionner.
- Les fonctions avancées sont rattachées au flux de validation/suppression de séance via `api.ts`.

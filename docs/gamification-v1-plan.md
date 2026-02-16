# Gamification V1 - Plan non destructif

## Objectif
Ajouter une surcouche gamification V1 sans refonte du coeur (sessions, pages et stockage existants conserves).

## Etapes
1. Ajouter un module isole `src/gamification/*` (types, config, moteur, stockage, API locale).
2. Ajouter le catalogue 40 missions dans `src/gamification/data/missions.catalog.v1.json`.
3. Brancher un unique evenement: `session validee` -> calcul XP -> niveau -> streak -> missions -> leaderboard -> notifications.
4. Garder les missions existantes et ajouter une section Missions V1 en parallele.
5. Ajouter UI minimale Home: niveau V1, XP restante, streak, missions en cours, et notifications de debloquage.
6. Ajouter garde-fous anti-triche invisibles (2 seances/jour, plafond hebdo 1200 XP).
7. Ajouter tests basiques sur regles XP et repartition du catalogue.
8. Conserver mode degradation: si gamification desactivee, comportement historique intact.

## Checklist
- [x] Module isole et activable/desactivable
- [x] Journal XP utilisateur (`user_xp_log`)
- [x] Niveau utilisateur (`user_level`)
- [x] Streak utilisateur (`user_streak`)
- [x] Missions catalogue + progression utilisateur
- [x] Saisons (12 semaines) + rollover simple
- [x] Teams + membres (V1 simple)
- [x] Leaderboard hebdo + saison (local)
- [x] Notifications level-up / surprise unlock
- [x] Plafond 2 seances/jour + 1200 XP/semaine
- [x] Tests basiques moteurs

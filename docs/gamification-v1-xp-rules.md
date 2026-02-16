# Gamification V1 - Regles XP

Regles implementees dans `src/gamification/engine.ts`.

## Activite brute
- Run <30 min: 30 XP
- Seance standard >=30 min: 40 XP
- Seance cle (VMA, SEUIL, SORTIE_LONGUE, RENFO): 50 XP

## Garde-fous
- Maximum 2 seances XP par jour
- Plafond hebdo total: 1200 XP
- Bonus progression hebdo borne

## Streak
- 3 semaines actives: +150 XP
- 4 semaines actives: +300 XP
- 8 semaines actives: +600 XP

## Progression (fenetre glissante)
- Amelioration chrono 5k: +150 XP
- Amelioration distance: +100 XP
- Amelioration frequence: +100 XP

## Missions
- Bronze: 100 XP
- Argent: 200 XP
- Or: 350 XP
- Elite: 600 XP
- Claim manuel uniquement

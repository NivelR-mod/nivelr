# Gamification V1 - API locale (surcouche)

Implementation: `src/gamification/api.ts`

## Endpoints metier (fonctions)
- `apiGetGamificationState()`
- `apiPostSessionValidated(session, sessionsAfterInsert)`
- `apiPostMissionClaim(missionId)`
- `apiGetMissionCatalog()`
- `apiPatchGamificationEnabled(enabled)`
- `apiPostTeamCreate(name, memberUserIds)`
- `apiPostTeamJoin(teamId, userId)`
- `apiGetWeeklyLeaderboard()`
- `apiGetSeasonLeaderboard()`
- `apiPostSeasonRollover()`
- `apiPostUnlockNotificationsSeen()`
- `apiDeleteGamificationData()`

## Mapping REST futur (si backend)
- `GET /gamification/state`
- `POST /gamification/session-validated`
- `POST /gamification/missions/:id/claim`
- `GET /gamification/missions`
- `PATCH /gamification/settings`
- `POST /gamification/teams`
- `POST /gamification/teams/:id/join`
- `GET /gamification/leaderboard/weekly`
- `GET /gamification/leaderboard/season`
- `POST /gamification/seasons/rollover`
- `POST /gamification/unlocks/seen`
- `DELETE /gamification/state`

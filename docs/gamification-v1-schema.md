# Gamification V1 - Schema collections

## user_xp_log
- `id` (string)
- `userId` (string)
- `weekKey` (string)
- `dateKey` (string)
- `amount` (number)
- `reason` (enum)
- `sourceRef` (string)
- `createdAt` (ISO string)

## user_level
- `userId` (string)
- `level` (number)
- `xpTotal` (number)
- `xpToNextLevel` (number)
- `updatedAt` (ISO string)

## user_streak
- `userId` (string)
- `activeWeeks` (number)
- `jokerRemaining` (number)
- `lastEvaluatedWeekKey` (string | null)
- `awardedMilestones` (string[])

## missions
- `id` (string)
- `title` (string)
- `description` (string)
- `tier` (BRONZE/SILVER/GOLD/ELITE)
- `discipline` (RUN/RENFO/MIX)
- `window` (WEEKLY/ONE_SHOT/SEASON)
- `criterion` (kind + target)
- `xpReward` (number)
- `minLevel` (number)

## missions_user_progress
- `userId` (string)
- `missionId` (string)
- `progressValue` (number)
- `status` (LOCKED/IN_PROGRESS/DONE/CLAIMED)
- `updatedAt` (ISO string)
- `claimedAt` (ISO string | undefined)

## seasons
- `id` (string)
- `label` (string)
- `startDate` (ISO string)
- `endDate` (ISO string)
- `state` (UPCOMING/ACTIVE/ENDED)
- `carryOverRatio` (number)

## leaderboards
- `weekly` (LeaderboardEntry[])
- `season` (LeaderboardEntry[])
- `updatedAt` (ISO string)

## teams
- `id` (string)
- `name` (string)
- `createdAt` (ISO string)

## team_members
- `teamId` (string)
- `userId` (string)
- `role` (OWNER/MEMBER)
- `joinedAt` (ISO string)

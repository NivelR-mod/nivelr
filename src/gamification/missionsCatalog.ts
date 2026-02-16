import rawCatalog from './data/missions.catalog.v1.json';
import { GAMIFICATION_V1_CONFIG } from './config';
import { GamificationMission } from './types';

function isMissionTier(value: string): value is GamificationMission['tier'] {
  return value === 'BRONZE' || value === 'SILVER' || value === 'GOLD' || value === 'PLATINUM';
}

function isMissionWindow(value: string): value is GamificationMission['window'] {
  return value === 'WEEKLY' || value === 'ONE_SHOT' || value === 'SEASON';
}

function isMissionDiscipline(value: string): value is GamificationMission['discipline'] {
  return value === 'RUN' || value === 'RENFO' || value === 'MIX';
}

export function getGamificationMissionCatalog(): GamificationMission[] {
  const parsed = (rawCatalog as GamificationMission[]).filter((mission) => {
    return (
      typeof mission.id === 'string' &&
      typeof mission.title === 'string' &&
      typeof mission.description === 'string' &&
      isMissionTier(mission.tier) &&
      isMissionDiscipline(mission.discipline) &&
      isMissionWindow(mission.window) &&
      typeof mission.xpReward === 'number' &&
      typeof mission.minLevel === 'number' &&
      mission.criterion !== undefined
    );
  });

  return parsed;
}

export function getEligibleMissionsForLevel(level: number): GamificationMission[] {
  return getGamificationMissionCatalog().filter((mission) => mission.minLevel <= level);
}

export function getCatalogSummary(): {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
  version: string;
} {
  const missions = getGamificationMissionCatalog();
  return {
    bronze: missions.filter((mission) => mission.tier === 'BRONZE').length,
    silver: missions.filter((mission) => mission.tier === 'SILVER').length,
    gold: missions.filter((mission) => mission.tier === 'GOLD').length,
    platinum: missions.filter((mission) => mission.tier === 'PLATINUM').length,
    version: GAMIFICATION_V1_CONFIG.missionCatalogVersion
  };
}

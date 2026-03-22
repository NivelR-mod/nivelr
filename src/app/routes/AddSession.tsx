import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buildCoachFeedbackTextFromSessions,
  CoachHubData,
  getCoachHubData,
  getCoachSubmissionDeadline,
  getCurrentWeekCoachSessions,
  submitCoachFeedback
} from '../../backend/coach';
import { computeSessionXp, createSession } from '../../domain/sessions';
import { getWeekKeyFromDate } from '../../storage/localStore';
import { Session, SessionInput } from '../../types/models';
import addSessionRecoBg from '../../assets/add-session-reco-bg.jpg';

interface AddSessionProps {
  onAddSession: (session: Session) => void;
  existingSessions?: Session[];
}

type SessionKind =
  | 'EF'
  | 'ENDURANCE_ACTIVE'
  | 'SEUIL'
  | 'FRACTIONNE_COURT'
  | 'FRACTIONNE_LONG'
  | 'SORTIE_LONGUE'
  | 'FARTLEK'
  | 'COTES'
  | 'RENFO_COURSE'
  | 'RECUP';
type Surface = 'ROUTE' | 'TRAIL' | 'TAPIS';
type GoalRespect = 'YES' | 'PARTIAL' | 'NO';
type IntervalUnit = 'SEC' | 'MIN' | 'M' | 'KM';

interface FormState {
  sessionDate: string;
  distanceKm: string;
  durationHours: string;
  durationMinutes: string;
  durationSeconds: string;
  rpe: string;
  kind: SessionKind;
  hrAvg: string;
  elevationM: string;
  comment: string;
  surface: Surface;
  goalRespect: GoalRespect;
}

interface IntervalBlock {
  id: string;
  reps: string;
  workValue: string;
  workUnit: IntervalUnit;
  restValue: string;
  restUnit: IntervalUnit;
}

interface SessionRecommendation {
  kind: SessionKind;
  reason: string;
  checks: string[];
}

const SESSION_KIND_OPTIONS: Array<{ value: SessionKind; label: string; short: string }> = [
  { value: 'EF', label: 'Endurance fondamentale (EF)', short: 'EF' },
  { value: 'ENDURANCE_ACTIVE', label: 'Endurance active / tempo léger', short: 'Tempo' },
  { value: 'SEUIL', label: 'Seuil (tempo soutenu)', short: 'Seuil' },
  { value: 'FRACTIONNE_COURT', label: 'Fractionné court (VMA/vitesse)', short: 'Frac court' },
  { value: 'FRACTIONNE_LONG', label: 'Fractionné long', short: 'Frac long' },
  { value: 'SORTIE_LONGUE', label: 'Sortie longue', short: 'Longue' },
  { value: 'FARTLEK', label: 'Fartlek', short: 'Fartlek' },
  { value: 'COTES', label: 'Côtes / travail en montée', short: 'Côtes' },
  { value: 'RENFO_COURSE', label: 'Renforcement spécifique course', short: 'Renfo' },
  { value: 'RECUP', label: 'Récupération / footing léger', short: 'Récup' }
];

const INTERVAL_COMPATIBLE_KINDS: SessionKind[] = [
  'SEUIL',
  'FRACTIONNE_COURT',
  'FRACTIONNE_LONG',
  'FARTLEK',
  'COTES'
];

function mapKindToSessionInput(
  kind: SessionKind
): { sportType: SessionInput['sportType']; subtype: SessionInput['subtype'] } {
  if (kind === 'EF' || kind === 'RECUP') return { sportType: 'RUNNING', subtype: 'EF' };
  if (kind === 'ENDURANCE_ACTIVE' || kind === 'SEUIL' || kind === 'FRACTIONNE_LONG') {
    return { sportType: 'RUNNING', subtype: 'SEUIL' };
  }
  if (kind === 'FRACTIONNE_COURT' || kind === 'FARTLEK' || kind === 'COTES') {
    return { sportType: 'RUNNING', subtype: 'VMA' };
  }
  if (kind === 'SORTIE_LONGUE') return { sportType: 'RUNNING', subtype: 'SORTIE_LONGUE' };
  if (kind === 'RENFO_COURSE') return { sportType: 'OTHER', subtype: 'RENFO' };
  return { sportType: 'OTHER', subtype: 'MOBILITE' };
}

function kindLabel(kind: SessionKind): string {
  if (kind === 'ENDURANCE_ACTIVE') return 'Endurance active';
  if (kind === 'FRACTIONNE_COURT') return 'Fractionné court';
  if (kind === 'FRACTIONNE_LONG') return 'Fractionné long';
  if (kind === 'SORTIE_LONGUE') return 'Sortie longue';
  if (kind === 'RENFO_COURSE') return 'Renforcement';
  if (kind === 'RECUP') return 'Récupération';
  if (kind === 'SEUIL') return 'Seuil';
  if (kind === 'FARTLEK') return 'Fartlek';
  if (kind === 'COTES') return 'Côtes';
  return 'Endurance fondamentale';
}

function kindHint(kind: SessionKind): string {
  if (kind === 'EF') return 'Allure confortable, base aérobie.';
  if (kind === 'ENDURANCE_ACTIVE') return 'Soutenu mais contrôlé.';
  if (kind === 'SEUIL') return 'Tempo soutenu stable.';
  if (kind === 'FRACTIONNE_COURT') return 'Intervalles courts intenses.';
  if (kind === 'FRACTIONNE_LONG') return 'Intervalles longs orientés performance.';
  if (kind === 'SORTIE_LONGUE') return 'Volume long en endurance.';
  if (kind === 'FARTLEK') return 'Alternance libre des allures.';
  if (kind === 'COTES') return 'Travail de force en montée.';
  if (kind === 'RENFO_COURSE') return 'Prévention blessures et force spécifique.';
  return 'Footing très facile de régénération.';
}

function deriveFeltStateFromRpe(rpe: number): number {
  if (rpe <= 3) return 5;
  if (rpe <= 5) return 4;
  if (rpe <= 7) return 3;
  if (rpe <= 8) return 2;
  return 1;
}

function deriveFatigueFromRpe(rpe: number): number {
  if (rpe <= 3) return 1;
  if (rpe <= 5) return 2;
  if (rpe <= 7) return 3;
  if (rpe <= 8) return 4;
  return 5;
}

function formatPace(distanceKm: number, durationMin: number): string {
  if (distanceKm <= 0) return '--';
  const pace = durationMin / distanceKm;
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60)
    .toString()
    .padStart(2, '0');
  return `${min}:${sec}/km`;
}

function goalRespectLabel(value: GoalRespect): string {
  if (value === 'YES') return 'oui';
  if (value === 'PARTIAL') return 'partiellement';
  return 'non';
}

function isDistanceRequired(kind: SessionKind): boolean {
  return kind !== 'RENFO_COURSE';
}

function isIntervalCompatibleKind(kind: SessionKind): boolean {
  return INTERVAL_COMPATIBLE_KINDS.includes(kind);
}

function createIntervalBlock(seed = Date.now()): IntervalBlock {
  return {
    id: `interval_${seed}_${Math.round(Math.random() * 100000)}`,
    reps: '1',
    workValue: '',
    workUnit: 'MIN',
    restValue: '',
    restUnit: 'MIN'
  };
}

function parsePositiveNumber(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function intervalUnitLabel(unit: IntervalUnit): string {
  if (unit === 'SEC') return 'sec';
  if (unit === 'MIN') return 'min';
  if (unit === 'M') return 'm';
  return 'km';
}

function summarizeIntervals(blocks: IntervalBlock[]): string {
  return blocks
    .map((block) => {
      const reps = Math.max(1, Math.floor(Number(block.reps) || 1));
      const workPart = block.workValue
        ? `${block.workValue.replace('.', ',')}${intervalUnitLabel(block.workUnit)}`
        : '?';
      const restPart = block.restValue
        ? `${block.restValue.replace('.', ',')}${intervalUnitLabel(block.restUnit)} rec`
        : '';
      return restPart ? `${reps}x(${workPart} / ${restPart})` : `${reps}x(${workPart})`;
    })
    .join(' · ');
}

function computeIntervalTotals(blocks: IntervalBlock[]): {
  durationMin: number;
  distanceKm: number;
  hasDuration: boolean;
  hasDistance: boolean;
  hasInvalid: boolean;
} {
  let totalDurationSec = 0;
  let totalDistanceKm = 0;
  let hasDuration = false;
  let hasDistance = false;
  let hasInvalid = false;

  for (const block of blocks) {
    const reps = Math.max(1, Math.floor(Number(block.reps) || 1));
    const workValue = parsePositiveNumber(block.workValue);
    const restValue = parsePositiveNumber(block.restValue);

    if (block.workValue.trim() && workValue == null) hasInvalid = true;
    if (block.restValue.trim() && restValue == null) hasInvalid = true;

    if (workValue != null) {
      if (block.workUnit === 'SEC') {
        totalDurationSec += reps * workValue;
        hasDuration = true;
      } else if (block.workUnit === 'MIN') {
        totalDurationSec += reps * workValue * 60;
        hasDuration = true;
      } else if (block.workUnit === 'M') {
        totalDistanceKm += (reps * workValue) / 1000;
        hasDistance = true;
      } else {
        totalDistanceKm += reps * workValue;
        hasDistance = true;
      }
    }

    if (restValue != null) {
      if (block.restUnit === 'SEC') {
        totalDurationSec += reps * restValue;
        hasDuration = true;
      } else if (block.restUnit === 'MIN') {
        totalDurationSec += reps * restValue * 60;
        hasDuration = true;
      } else if (block.restUnit === 'M') {
        totalDistanceKm += (reps * restValue) / 1000;
        hasDistance = true;
      } else {
        totalDistanceKm += reps * restValue;
        hasDistance = true;
      }
    }
  }

  return {
    durationMin: totalDurationSec / 60,
    distanceKm: totalDistanceKm,
    hasDuration,
    hasDistance,
    hasInvalid
  };
}

function inferMainGoal(existingSessions: Session[]): 'PERFORMANCE' | 'LONG_DISTANCE' | 'HEALTH' {
  const recent = existingSessions
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 20);
  const longCount = recent.filter((session) => session.subtype === 'SORTIE_LONGUE').length;
  const avgDistance =
    recent.length > 0
      ? recent.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0) / recent.length
      : 0;
  const intenseCount = recent.filter((session) => session.feelings.rpe >= 7).length;

  if (longCount >= 2 || avgDistance >= 11) return 'LONG_DISTANCE';
  if (intenseCount >= 4) return 'PERFORMANCE';
  return 'HEALTH';
}

function getWeekSessions(existingSessions: Session[]): Session[] {
  const currentWeek = getWeekKeyFromDate(new Date());
  return existingSessions.filter(
    (session) => getWeekKeyFromDate(new Date(session.createdAt)) === currentWeek
  );
}

function getRecommendedKind(existingSessions: Session[]): SessionRecommendation {
  const mainGoal = inferMainGoal(existingSessions);
  const weekSessions = getWeekSessions(existingSessions);
  const intenseCount = weekSessions.filter((session) => session.feelings.rpe >= 7).length;
  const longCount = weekSessions.filter((session) => session.subtype === 'SORTIE_LONGUE').length;
  const easyCount = weekSessions.filter((session) => session.subtype === 'EF').length;
  const renfoCount = weekSessions.filter((session) => session.subtype === 'RENFO').length;

  const recent7d = existingSessions.filter((session) => {
    const delta = Date.now() - new Date(session.createdAt).getTime();
    return delta >= 0 && delta <= 7 * 24 * 60 * 60 * 1000;
  });
  const avgRecentRpe = recent7d.length
    ? recent7d.reduce((sum, session) => sum + session.feelings.rpe, 0) / recent7d.length
    : 0;

  const recent3d = existingSessions.filter((session) => {
    const delta = Date.now() - new Date(session.createdAt).getTime();
    return delta >= 0 && delta <= 3 * 24 * 60 * 60 * 1000;
  }).length;

  if (intenseCount >= 2 && longCount >= 1) {
    return {
      kind: 'EF',
      reason: 'Ta semaine est déjà intense. Une sortie facile optimise ta progression.',
      checks: ['2 séances intenses (RPE >= 7) déjà réalisées', '1 sortie longue validée']
    };
  }

  if (avgRecentRpe >= 7 || recent3d >= 3) {
    return {
      kind: 'RECUP',
      reason: 'Charge récente élevée. Un footing léger améliore la récupération.',
      checks: ['Fatigue implicite détectée', 'Récupération priorisée']
    };
  }

  if (easyCount >= 3 && intenseCount === 0) {
    return {
      kind: mainGoal === 'PERFORMANCE' ? 'FRACTIONNE_COURT' : 'SEUIL',
      reason: 'Ajoute une séance intense (RPE >= 7) pour débloquer ton bonus équilibre.',
      checks: ['3 sorties faciles déjà faites', 'Aucune séance intense (RPE >= 7) cette semaine']
    };
  }

  if (mainGoal === 'LONG_DISTANCE' && longCount === 0) {
    return {
      kind: 'SORTIE_LONGUE',
      reason: 'Essentielle pour progresser vers ton objectif distance longue.',
      checks: ['Objectif longue distance détecté', 'Aucune sortie longue cette semaine']
    };
  }

  if (renfoCount === 0 && weekSessions.length >= 3) {
    return {
      kind: 'RENFO_COURSE',
      reason: 'Ajoute 1 séance renforcement pour réduire ton risque de blessure.',
      checks: ['Aucune séance renfo cette semaine', 'Volume suffisant pour inclure du renfo']
    };
  }

  return {
    kind: 'EF',
    reason: 'Base fiable pour progresser avec régularité sans surcharge.',
    checks: ['Semaine en construction', 'Choix sûr pour maintenir le rythme']
  };
}

export default function AddSession({ onAddSession, existingSessions = [] }: AddSessionProps): JSX.Element {
  const navigate = useNavigate();
  const todayIso = new Date().toISOString().slice(0, 10);
  const minDateIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [form, setForm] = useState<FormState>({
    sessionDate: todayIso,
    distanceKm: '',
    durationHours: '0',
    durationMinutes: '30',
    durationSeconds: '0',
    rpe: '5',
    kind: 'EF',
    hrAvg: '',
    elevationM: '',
    comment: '',
    surface: 'ROUTE',
    goalRespect: 'YES'
  });

  const [error, setError] = useState<string>('');
  const [duplicateHint, setDuplicateHint] = useState<string>('');
  const [manualChoice, setManualChoice] = useState<boolean>(false);
  const [intervalBlocks, setIntervalBlocks] = useState<IntervalBlock[]>([createIntervalBlock()]);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [coachHubData, setCoachHubData] = useState<CoachHubData | null>(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [coachSending, setCoachSending] = useState(false);
  const [coachError, setCoachError] = useState('');
  const [coachMessage, setCoachMessage] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());

  const setField = (field: keyof FormState, value: string): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const recommendation = useMemo(() => getRecommendedKind(existingSessions), [existingSessions]);
  const durationTotalMin = useMemo(() => {
    const hours = Number(form.durationHours);
    const minutes = Number(form.durationMinutes);
    const seconds = Number(form.durationSeconds);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return NaN;
    return hours * 60 + minutes + seconds / 60;
  }, [form.durationHours, form.durationMinutes, form.durationSeconds]);
  const intervalTotals = useMemo(() => computeIntervalTotals(intervalBlocks), [intervalBlocks]);
  const intervalModeActive = isIntervalCompatibleKind(form.kind);
  const effectiveDurationMin =
    intervalModeActive && intervalTotals.hasDuration ? intervalTotals.durationMin : durationTotalMin;
  const effectiveDistanceKm =
    intervalModeActive && intervalTotals.hasDistance ? intervalTotals.distanceKm : Number(form.distanceKm);

  useEffect(() => {
    if (!manualChoice) {
      setForm((prev) => ({ ...prev, kind: recommendation.kind }));
    }
  }, [manualChoice, recommendation.kind]);

  const setIntervalField = (id: string, field: keyof IntervalBlock, value: string): void => {
    setIntervalBlocks((prev) =>
      prev.map((block) => (block.id === id ? { ...block, [field]: value } : block))
    );
  };

  const addIntervalBlock = (): void => {
    setIntervalBlocks((prev) => [...prev, createIntervalBlock()]);
  };

  const removeIntervalBlock = (id: string): void => {
    setIntervalBlocks((prev) => (prev.length > 1 ? prev.filter((block) => block.id !== id) : prev));
  };

  const applyIntervalTotalsToMainFields = (): void => {
    const next: Partial<FormState> = {};
    if (intervalTotals.hasDuration) {
      const totalSeconds = Math.round(intervalTotals.durationMin * 60);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      next.durationHours = String(hours);
      next.durationMinutes = String(minutes);
      next.durationSeconds = String(seconds);
    }
    if (intervalTotals.hasDistance) {
      next.distanceKm = intervalTotals.distanceKm.toFixed(2).replace(/\.?0+$/, '');
    }
    setForm((prev) => ({ ...prev, ...next }));
  };

  const validate = (): string | null => {
    const distanceRequired = isDistanceRequired(form.kind);
    const hours = Number(form.durationHours);
    const minutes = Number(form.durationMinutes);
    const seconds = Number(form.durationSeconds);
    const duration = effectiveDurationMin;
    const distance = effectiveDistanceKm;
    const rpe = Number(form.rpe);
    const hrAvg = form.hrAvg ? Number(form.hrAvg) : undefined;
    const elevation = form.elevationM ? Number(form.elevationM) : undefined;
    const selectedDate = new Date(`${form.sessionDate}T12:00:00`);
    const now = new Date();
    const minAllowed = new Date(now);
    minAllowed.setDate(minAllowed.getDate() - 7);
    minAllowed.setHours(0, 0, 0, 0);
    now.setHours(23, 59, 59, 999);

    if (distanceRequired && (!Number.isFinite(distance) || distance <= 0)) {
      return 'La distance doit être un nombre supérieur à 0.';
    }
    if (intervalModeActive) {
      if (!intervalBlocks.length) {
        return 'Ajoute au moins un bloc intervalle.';
      }
      if (intervalTotals.hasInvalid) {
        return 'Un bloc intervalle contient une valeur invalide.';
      }
      if (!intervalTotals.hasDuration && !intervalTotals.hasDistance) {
        return 'Renseigne au moins un temps ou une distance dans tes intervalles.';
      }
    }
    if (!Number.isInteger(hours) || hours < 0) {
      return 'Les heures doivent être un entier positif.';
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      return 'Les minutes doivent être entre 0 et 59.';
    }
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
      return 'Les secondes doivent être entre 0 et 59.';
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return 'La durée doit être supérieure à 0.';
    }
    if (!form.sessionDate || Number.isNaN(selectedDate.getTime())) {
      return 'La date de séance est invalide.';
    }
    if (selectedDate.getTime() < minAllowed.getTime()) {
      return 'Tu peux enregistrer une séance jusqu’à J-7 maximum.';
    }
    if (selectedDate.getTime() > now.getTime()) {
      return 'La date de séance ne peut pas être dans le futur.';
    }
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
      return 'Le RPE doit être un entier entre 1 et 10.';
    }
    if (form.hrAvg && (!Number.isFinite(hrAvg) || (hrAvg ?? 0) <= 0)) {
      return 'La fréquence cardiaque moyenne doit être vide ou positive.';
    }
    if (form.elevationM && (!Number.isFinite(elevation) || (elevation ?? 0) < 0)) {
      return 'Le dénivelé doit être vide ou positif.';
    }
    return null;
  };

  const validateDateStep = (): string | null => {
    const selectedDate = new Date(`${form.sessionDate}T12:00:00`);
    const now = new Date();
    const minAllowed = new Date(now);
    minAllowed.setDate(minAllowed.getDate() - 7);
    minAllowed.setHours(0, 0, 0, 0);
    now.setHours(23, 59, 59, 999);
    if (!form.sessionDate || Number.isNaN(selectedDate.getTime())) return 'La date de séance est invalide.';
    if (selectedDate.getTime() < minAllowed.getTime()) return 'Tu peux enregistrer une séance jusqu’à J-7 maximum.';
    if (selectedDate.getTime() > now.getTime()) return 'La date de séance ne peut pas être dans le futur.';
    return null;
  };

  const validateIntervalsStep = (): string | null => {
    if (!intervalModeActive) return null;
    if (!intervalBlocks.length) return 'Ajoute au moins un bloc intervalle.';
    if (intervalTotals.hasInvalid) return 'Un bloc intervalle contient une valeur invalide.';
    if (!intervalTotals.hasDuration && !intervalTotals.hasDistance) {
      return 'Renseigne au moins un temps ou une distance dans tes intervalles.';
    }
    return null;
  };

  const validateDistanceDurationStep = (): string | null => {
    const distanceRequired = isDistanceRequired(form.kind);
    const hours = Number(form.durationHours);
    const minutes = Number(form.durationMinutes);
    const seconds = Number(form.durationSeconds);
    const duration = effectiveDurationMin;
    const distance = effectiveDistanceKm;
    const rpe = Number(form.rpe);
    if (distanceRequired && (!Number.isFinite(distance) || distance <= 0)) {
      return 'La distance doit être un nombre supérieur à 0.';
    }
    if (!Number.isInteger(hours) || hours < 0) return 'Les heures doivent être un entier positif.';
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return 'Les minutes doivent être entre 0 et 59.';
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) return 'Les secondes doivent être entre 0 et 59.';
    if (!Number.isFinite(duration) || duration <= 0) return 'La durée doit être supérieure à 0.';
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return 'Le RPE doit être un entier entre 1 et 10.';
    return null;
  };

  const pacePreview = useMemo(() => {
    if (!isDistanceRequired(form.kind)) return '--';
    const distance = effectiveDistanceKm;
    const duration = effectiveDurationMin;
    if (!Number.isFinite(distance) || distance <= 0) return '--';
    if (!Number.isFinite(duration) || duration <= 0) return '--';
    return formatPace(distance, duration);
  }, [effectiveDistanceKm, effectiveDurationMin, form.kind]);

  const xpPreview = useMemo(() => {
    const distanceRequired = isDistanceRequired(form.kind);
    const distance = effectiveDistanceKm;
    const duration = effectiveDurationMin;
    const rpe = Number(form.rpe);
    if (distanceRequired && (!Number.isFinite(distance) || distance <= 0)) return null;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return null;

    const mapped = mapKindToSessionInput(form.kind);
    const input: SessionInput = {
      sportType: mapped.sportType,
      subtype: mapped.subtype,
      distanceKm: distanceRequired ? distance : undefined,
      durationMin: duration,
      feelings: {
        rpe,
        feltState: deriveFeltStateFromRpe(rpe),
        fatigue: deriveFatigueFromRpe(rpe)
      }
    };

    return computeSessionXp(input);
  }, [effectiveDistanceKm, effectiveDurationMin, form.kind, form.rpe]);

  useEffect(() => {
    let active = true;
    const loadCoachHub = async (): Promise<void> => {
      setCoachLoading(true);
      const result = await getCoachHubData();
      if (!active) return;
      if (!result.ok || !result.data) {
        setCoachHubData(null);
        setCoachLoading(false);
        return;
      }
      setCoachHubData(result.data);
      setCoachLoading(false);
    };
    void loadCoachHub();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const coachDeadline = useMemo(() => getCoachSubmissionDeadline(new Date(nowTick)), [nowTick]);
  const coachWeekSessions = useMemo(
    () => getCurrentWeekCoachSessions(existingSessions, new Date(nowTick)),
    [existingSessions, nowTick]
  );
  const coachCanSend = Boolean(
    coachHubData?.intakeCompleted && coachHubData.activeProgram && coachWeekSessions.length > 0
  );
  const coachShouldAutoSend = Boolean(
    coachHubData?.intakeCompleted &&
      coachHubData.activeProgram &&
      !coachHubData.feedbackAlreadySent &&
      coachWeekSessions.length > 0 &&
      Date.now() >= coachDeadline.getTime()
  );

  const refreshCoachHub = async (): Promise<void> => {
    const result = await getCoachHubData();
    if (!result.ok || !result.data) {
      setCoachHubData(null);
      return;
    }
    setCoachHubData(result.data);
  };

  const sendCoachWeekNow = async (mode: 'manual' | 'auto'): Promise<void> => {
    if (!coachHubData?.activeProgram || !coachCanSend) return;
    setCoachError('');
    setCoachMessage('');
    setCoachSending(true);
    const result = await submitCoachFeedback({
      weekNumber: coachHubData.activeProgram.weekNumber,
      feedbackText: buildCoachFeedbackTextFromSessions(
        coachHubData.activeProgram.weekNumber,
        coachWeekSessions,
        new Date()
      ),
      readyForNextWeek: true
    });
    setCoachSending(false);
    if (!result.ok) {
      setCoachError(result.error ?? "Impossible d'envoyer le retour au coach.");
      return;
    }
    setCoachMessage(
      result.warning ??
        (mode === 'auto'
          ? 'Retour de semaine envoyé automatiquement au coach.'
          : 'Retour de semaine envoyé au coach.')
    );
    await refreshCoachHub();
  };

  useEffect(() => {
    if (!coachShouldAutoSend || coachSending) return;
    void sendCoachWeekNow('auto');
  }, [coachShouldAutoSend, coachSending]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const distanceRequired = isDistanceRequired(form.kind);
    const distance = effectiveDistanceKm;
    const duration = effectiveDurationMin;
    const rpe = Number(form.rpe);

    const mapped = mapKindToSessionInput(form.kind);

    const metaParts: string[] = [];
    if (form.hrAvg) metaParts.push(`FC moy: ${Math.round(Number(form.hrAvg))} bpm`);
    if (form.elevationM) metaParts.push(`D+: ${Math.round(Number(form.elevationM))} m`);
    metaParts.push(`Catégorie: ${kindLabel(form.kind)}`);
    metaParts.push(`Surface: ${form.surface.toLowerCase()}`);
    metaParts.push(`Objectif respecté: ${goalRespectLabel(form.goalRespect)}`);
    if (intervalModeActive && intervalBlocks.length) {
      metaParts.push(`Intervalles: ${summarizeIntervals(intervalBlocks)}`);
    }
    if (distanceRequired) {
      metaParts.push(`Allure auto: ${formatPace(distance, duration)}`);
    }

    const comments = [form.comment.trim(), metaParts.join(' · ')].filter(Boolean).join('\n');

    const payload: SessionInput = {
      sportType: mapped.sportType,
      subtype: mapped.subtype,
      durationMin: duration,
      distanceKm: distanceRequired ? distance : undefined,
      feelings: {
        rpe,
        feltState: deriveFeltStateFromRpe(rpe),
        fatigue: deriveFatigueFromRpe(rpe)
      },
      comment: comments || undefined
    };
    const createdAt = new Date(`${form.sessionDate}T12:00:00`).toISOString();

    const duplicate = existingSessions.find((session) => {
      const deltaMs = Math.abs(new Date(createdAt).getTime() - new Date(session.createdAt).getTime());
      const withinTwoHours = deltaMs <= 2 * 60 * 60 * 1000;
      return (
        withinTwoHours &&
        Math.abs((session.distanceKm ?? 0) - (payload.distanceKm ?? 0)) <= 0.4 &&
        Math.abs(session.durationMin - payload.durationMin) <= 10
      );
    });

    if (duplicate) {
      setDuplicateHint('Séance similaire détectée récemment. Vérifie si ce n’est pas un doublon.');
      const proceed = window.confirm(
        'Une séance similaire a été détectée récemment. Veux-tu vraiment enregistrer cette nouvelle séance ?'
      );
      if (!proceed) return;
    } else {
      setDuplicateHint('');
    }

    const session = createSession(payload, { createdAt });
    onAddSession(session);
    navigate('/sessions');
  };

  const goToStep = (step: 1 | 2 | 3 | 4 | 5): void => {
    if (step <= maxReachedStep) {
      setCurrentStep(step);
      setError('');
    }
  };

  return (
    <section className="page page-add">
      <h1>Nouvelle séance</h1>
      <p className="page-subtitle">Minimum en 20 secondes, puis options si tu veux aller plus loin.</p>

      <form className="card form premium-section add-v2-form" onSubmit={handleSubmit}>
        <article
          className="recommendation-box recommendation-box-compact recommendation-box-photo"
          style={{ '--add-session-reco-bg-image': `url(${addSessionRecoBg})` } as CSSProperties}
        >
          <div className="recommendation-head-row">
            <p className="recommendation-kicker">Séance recommandée</p>
            <h3>{kindLabel(recommendation.kind)}</h3>
          </div>
          <p>{recommendation.reason}</p>
          <div className="recommendation-actions">
            <button
              type="button"
              className={!manualChoice ? 'is-selected' : ''}
              onClick={() => {
                setField('kind', recommendation.kind);
                setManualChoice(false);
              }}
            >
              Utiliser cette suggestion
            </button>
            <button
              type="button"
              className={manualChoice ? 'is-selected' : ''}
              onClick={() => setManualChoice(true)}
            >
              Choisir un autre type
            </button>
          </div>
          <details className="recommendation-details">
            <summary>Pourquoi cette suggestion ?</summary>
            <ul>
              {recommendation.checks.map((check) => (
                <li key={check}>✔ {check}</li>
              ))}
            </ul>
            <p className="recommendation-mode">
              {manualChoice
                ? 'Mode manuel actif: choisis librement ta catégorie ci-dessous.'
                : 'Mode guidé actif: la catégorie recommandée est préselectionnée.'}
            </p>
          </details>
        </article>

        {coachHubData?.intakeCompleted && coachHubData.activeProgram ? (
          <article className="coach-inline-panel">
            <div className="coach-inline-panel-head">
              <div>
                <p className="recommendation-kicker">Suivi coach</p>
                <h3>Cette semaine partira automatiquement dimanche à 18h</h3>
              </div>
              {!coachHubData.feedbackAlreadySent ? (
                <button
                  type="button"
                  className="coach-inline-send-btn"
                  disabled={!coachCanSend || coachSending}
                  onClick={() => void sendCoachWeekNow('manual')}
                >
                  {coachSending ? 'Envoi...' : 'Envoyer avant la deadline'}
                </button>
              ) : null}
            </div>

            <div className="coach-inline-stats">
              <article className="coach-inline-stat">
                <span>Deadline</span>
                <strong>
                  {coachDeadline.toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long'
                  })}{' '}
                  à 18:00
                </strong>
              </article>
              <article className="coach-inline-stat">
                <span>Statut</span>
                <strong>{coachHubData.feedbackAlreadySent ? 'Déjà envoyé' : 'Envoi auto prévu'}</strong>
              </article>
              <article className="coach-inline-stat">
                <span>Séances cette semaine</span>
                <strong>{coachWeekSessions.length}</strong>
              </article>
            </div>

            <p className="coach-inline-note">
              Tes séances enregistrées ici servent directement au retour coach. Aucun formulaire doublon à remplir.
            </p>
            {coachLoading ? <p className="page-subtitle">Chargement du suivi coach...</p> : null}
            {coachError ? <p className="error">{coachError}</p> : null}
            {coachMessage ? <p className="inline-info">{coachMessage}</p> : null}
          </article>
        ) : null}

        <fieldset className="form-group required-group">
          <legend>Parcours guidé</legend>

          <section className={`optional-panel ${currentStep === 1 ? 'session-step-panel is-open' : 'session-step-panel'}`}>
            <header
              className="session-step-head"
              role="button"
              tabIndex={0}
              onClick={() => goToStep(1)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  goToStep(1);
                }
              }}
            >
              <span>Date</span>
              <small>{form.sessionDate}</small>
            </header>
            {currentStep === 1 ? (
              <div className="session-step-body">
                <label className="field-compact">
                  Date de séance
                  <input
                    type="date"
                    min={minDateIso}
                    max={todayIso}
                    value={form.sessionDate}
                    onChange={(e) => setField('sessionDate', e.target.value)}
                    required
                  />
                </label>
                <div className="goal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const stepError = validateDateStep();
                      if (stepError) {
                        setError(stepError);
                        return;
                      }
                      setError('');
                      setCurrentStep(2);
                      setMaxReachedStep((prev) => (prev < 2 ? 2 : prev));
                    }}
                  >
                    Valider la date
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className={`optional-panel ${currentStep === 2 ? 'session-step-panel is-open' : 'session-step-panel'}`}>
            <header
              className="session-step-head"
              role="button"
              tabIndex={0}
              onClick={() => goToStep(2)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  goToStep(2);
                }
              }}
            >
              <span>Type de séance</span>
              <small>{kindLabel(form.kind)}</small>
            </header>
            {currentStep === 2 ? (
              <div className="session-step-body">
                <div className="quick-required-grid">
                  <div className="session-kind-field">
                    <span>Type de séance</span>
                    <div role="radiogroup" aria-label="Type de séance" className="session-kind-grid">
                      {SESSION_KIND_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={form.kind === option.value}
                          className={`session-kind-card ${form.kind === option.value ? 'is-active' : ''}`}
                          onClick={() => {
                            setField('kind', option.value);
                            setManualChoice(true);
                          }}
                          title={option.label}
                        >
                          <strong>{option.short}</strong>
                          <small>{option.label}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="inline-info">{kindHint(form.kind)}</p>
                <div className="goal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      if (isIntervalCompatibleKind(form.kind)) {
                        setCurrentStep(3);
                        setMaxReachedStep((prev) => (prev < 3 ? 3 : prev));
                      } else {
                        setCurrentStep(4);
                        setMaxReachedStep((prev) => (prev < 4 ? 4 : prev));
                      }
                    }}
                  >
                    Valider le type
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {isIntervalCompatibleKind(form.kind) ? (
            <section
              className={`optional-panel ${currentStep === 3 ? 'session-step-panel is-open' : 'session-step-panel'}`}
            >
              <header
                className="session-step-head"
                role="button"
                tabIndex={0}
                onClick={() => goToStep(3)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    goToStep(3);
                  }
                }}
              >
                <span>Intervalles personnalisés</span>
                <small>{intervalBlocks.length} bloc(s)</small>
              </header>
              {currentStep === 3 ? (
                <div className="session-step-body">
                  <div className="interval-builder">
                    <div className="interval-builder-head">
                      <p>Intervalles travail / récupération</p>
                    </div>
                    <div className="interval-builder-list">
                      {intervalBlocks.map((block, index) => (
                        <div className="interval-row" key={block.id}>
                          <p className="interval-row-title">Bloc {index + 1}</p>
                          <div className="interval-row-grid">
                            <label>
                              Répétitions
                              <input
                                type="number"
                                min={1}
                                value={block.reps}
                                onChange={(event) => setIntervalField(block.id, 'reps', event.target.value)}
                              />
                            </label>
                            <label>
                              Travail
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                placeholder="Ex: 30"
                                value={block.workValue}
                                onChange={(event) => setIntervalField(block.id, 'workValue', event.target.value)}
                              />
                            </label>
                            <label>
                              Unité travail
                              <select
                                value={block.workUnit}
                                onChange={(event) => setIntervalField(block.id, 'workUnit', event.target.value)}
                              >
                                <option value="SEC">Secondes</option>
                                <option value="MIN">Minutes</option>
                                <option value="M">Mètres</option>
                                <option value="KM">Kilomètres</option>
                              </select>
                            </label>
                            <label>
                              Récupération
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                placeholder="Ex: 45"
                                value={block.restValue}
                                onChange={(event) => setIntervalField(block.id, 'restValue', event.target.value)}
                              />
                            </label>
                            <label>
                              Unité récup
                              <select
                                value={block.restUnit}
                                onChange={(event) => setIntervalField(block.id, 'restUnit', event.target.value)}
                              >
                                <option value="SEC">Secondes</option>
                                <option value="MIN">Minutes</option>
                                <option value="M">Mètres</option>
                                <option value="KM">Kilomètres</option>
                              </select>
                            </label>
                          </div>
                          <div className="interval-row-actions">
                            <button
                              type="button"
                              className="btn-compact"
                              onClick={() => removeIntervalBlock(block.id)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="goal-actions interval-actions">
                      <button type="button" className="btn-compact" onClick={addIntervalBlock}>
                        + Ajouter un bloc
                      </button>
                      <button type="button" className="btn-compact" onClick={applyIntervalTotalsToMainFields}>
                        Appliquer les totaux aux champs
                      </button>
                    </div>
                    <p className="page-subtitle">
                      Totaux intervalles: {intervalTotals.hasDuration ? `${intervalTotals.durationMin.toFixed(1)} min` : '--'} ·{' '}
                      {intervalTotals.hasDistance ? `${intervalTotals.distanceKm.toFixed(2)} km` : '--'}
                    </p>
                  </div>
                  <div className="goal-actions">
                    <button
                      type="button"
                      onClick={() => {
                        const stepError = validateIntervalsStep();
                        if (stepError) {
                          setError(stepError);
                          return;
                        }
                        setError('');
                        setCurrentStep(4);
                        setMaxReachedStep((prev) => (prev < 4 ? 4 : prev));
                      }}
                    >
                      Valider les intervalles
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className={`optional-panel ${currentStep === 4 ? 'session-step-panel is-open' : 'session-step-panel'}`}>
            <header
              className="session-step-head"
              role="button"
              tabIndex={0}
              onClick={() => goToStep(4)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  goToStep(4);
                }
              }}
            >
              <span>Distance + durée</span>
              <small>
                {Number.isFinite(effectiveDistanceKm) && effectiveDistanceKm > 0
                  ? `${effectiveDistanceKm.toFixed(2)} km`
                  : '--'}{' '}
                · {Number.isFinite(effectiveDurationMin) && effectiveDurationMin > 0 ? `${effectiveDurationMin.toFixed(1)} min` : '--'}
              </small>
            </header>
            {currentStep === 4 ? (
              <div className="session-step-body">
                <div className="quick-metrics-row quick-metrics-row--tight">
                  <label className="field-compact">
                    Distance (km){isDistanceRequired(form.kind) ? '' : ' (optionnelle pour renfo)'}
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={form.distanceKm}
                      onChange={(e) => setField('distanceKm', e.target.value)}
                      required={isDistanceRequired(form.kind) && !(intervalModeActive && intervalTotals.hasDistance)}
                    />
                  </label>

                  <label className="field-compact">
                    Durée (h/min/sec)
                    <div className="duration-inputs">
                      <input
                        type="number"
                        aria-label="Durée (heures)"
                        min={0}
                        max={23}
                        value={form.durationHours}
                        onChange={(e) => setField('durationHours', e.target.value)}
                        required
                      />
                      <input
                        type="number"
                        aria-label="Durée (minutes)"
                        min={0}
                        max={59}
                        value={form.durationMinutes}
                        onChange={(e) => setField('durationMinutes', e.target.value)}
                        required
                      />
                      <input
                        type="number"
                        aria-label="Durée (secondes)"
                        min={0}
                        max={59}
                        value={form.durationSeconds}
                        onChange={(e) => setField('durationSeconds', e.target.value)}
                        required
                      />
                    </div>
                  </label>
                </div>
                <div className="rpe-row">
                  <label htmlFor="rpe-input-v2">Ressenti global (RPE {form.rpe}/10)</label>
                  <input
                    id="rpe-input-v2"
                    type="range"
                    min={1}
                    max={10}
                    value={form.rpe}
                    onChange={(e) => setField('rpe', e.target.value)}
                    aria-label="RPE"
                  />
                </div>
                <div className="goal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const stepError = validateDistanceDurationStep();
                      if (stepError) {
                        setError(stepError);
                        return;
                      }
                      setError('');
                      setCurrentStep(5);
                      setMaxReachedStep((prev) => (prev < 5 ? 5 : prev));
                    }}
                  >
                    Valider distance + durée
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className={`optional-panel ${currentStep === 5 ? 'session-step-panel is-open' : 'session-step-panel'}`}>
            <header
              className="session-step-head"
              role="button"
              tabIndex={0}
              onClick={() => goToStep(5)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  goToStep(5);
                }
              }}
            >
              <span>Informations facultatives</span>
              <small>{form.comment.trim() || form.hrAvg || form.elevationM ? 'Renseignées' : 'Aucune'}</small>
            </header>
            {currentStep === 5 ? (
              <div className="session-step-body">
                <fieldset className="form-group optional-group">
            <label>
              Fréquence cardiaque moyenne (bpm)
              <input
                type="number"
                min={1}
                value={form.hrAvg}
                onChange={(e) => setField('hrAvg', e.target.value)}
                placeholder="Ex: 152"
              />
            </label>

            <label>
              Dénivelé positif (m)
              <input
                type="number"
                min={0}
                value={form.elevationM}
                onChange={(e) => setField('elevationM', e.target.value)}
                placeholder="Ex: 340"
              />
            </label>

            <label>
              Surface
              <select value={form.surface} onChange={(e) => setField('surface', e.target.value as Surface)}>
                <option value="ROUTE">Route</option>
                <option value="TRAIL">Trail</option>
                <option value="TAPIS">Tapis</option>
              </select>
            </label>

            <label>
              Objectif respecté
              <select
                value={form.goalRespect}
                onChange={(e) => setField('goalRespect', e.target.value as GoalRespect)}
              >
                <option value="YES">Oui</option>
                <option value="PARTIAL">Partiellement</option>
                <option value="NO">Non</option>
              </select>
            </label>

            <label>
              Commentaire libre
              <textarea
                rows={3}
                value={form.comment}
                onChange={(e) => setField('comment', e.target.value)}
                placeholder="Optionnel: ressenti, météo, points marquants..."
              />
            </label>
                </fieldset>
              </div>
            ) : null}
          </section>
        </fieldset>

        <div className="smart-summary">
          <p>
            <strong>Allure calculée automatiquement:</strong> {pacePreview}
          </p>
          <p>
            <strong>XP estimée:</strong> {xpPreview ?? '--'}
          </p>
          <p>
            NIVELR calcule ensuite automatiquement la séance clé, la progression et l&apos;impact missions.
          </p>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {duplicateHint ? <p className="inline-info">{duplicateHint}</p> : null}

        <button type="submit">Valider la séance</button>
      </form>
    </section>
  );
}

import { getCurrentSessionUser, isRemoteAuthEnabledLocal } from './localAuth';
import { sendContactEmail } from './contactEmail';
import { supabase } from './supabaseClient';
import { Session } from '../types/models';
import { getWeekKeyFromDate } from '../storage/localStore';

export interface CoachProgramSummary {
  id: string;
  weekNumber: number;
  title: string;
  description: string;
  storageBucket: string;
  storagePath: string;
  publishedAt: string | null;
}

export interface CoachHubData {
  intakeCompleted: boolean;
  intakeCompletedAt: string | null;
  publishedPrograms: CoachProgramSummary[];
  activeProgram: CoachProgramSummary | null;
  feedbackAlreadySent: boolean;
  activeFeedback: {
    weekNumber: number;
    feedbackText: string;
    readyForNextWeek: boolean;
    submittedAt: string;
  } | null;
}

export interface CoachSessionAutoSummary {
  id: string;
  title: string;
  dateLabel: string;
  distanceLabel: string;
  durationLabel: string;
  paceLabel: string;
  rpe: number;
  fatigue: number;
}

type CoachProgramRow = {
  id: string;
  week_number: number;
  title: string | null;
  description: string | null;
  storage_bucket: string | null;
  storage_path: string;
  published_at: string | null;
};

type CoachFeedbackRow = {
  week_number: number;
  feedback_text: string;
  ready_for_next_week: boolean;
  submitted_at: string;
  delivery_status?: 'PENDING' | 'SENT' | 'ERROR' | null;
};

const DEFAULT_STORAGE_BUCKET = (import.meta.env.VITE_COACH_STORAGE_BUCKET ?? 'coach-programs').trim();

function formatDurationLabel(durationMin: number): string {
  const rounded = Math.max(0, Math.round(durationMin));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function formatPaceLabel(distanceKm: number | undefined, durationMin: number): string {
  if (!distanceKm || distanceKm <= 0) return '--';
  const pace = durationMin / distanceKm;
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}/km`;
}

function normalizeBucketName(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) return DEFAULT_STORAGE_BUCKET;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      const marker = '/storage/v1/object/';
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const tail = url.pathname.slice(markerIndex + marker.length);
        const parts = tail.split('/').filter(Boolean);
        if (parts.length >= 2) {
          return parts[1].trim();
        }
      }
    } catch {
      return raw;
    }
  }
  return raw;
}

function canUseCoachCloud(): boolean {
  return Boolean(isRemoteAuthEnabledLocal() && supabase);
}

function getSessionUserId(): string | null {
  const user = getCurrentSessionUser();
  return user?.id ?? null;
}

export function getCoachSubmissionDeadline(now: Date = new Date()): Date {
  const deadline = new Date(now);
  const day = deadline.getDay();
  const deltaToSunday = day === 0 ? 0 : 7 - day;
  deadline.setDate(deadline.getDate() + deltaToSunday);
  deadline.setHours(20, 30, 0, 0);
  return deadline;
}

export function getCoachFeedbackWeekKey(now: Date = new Date()): string {
  const target = new Date(now);
  if (target.getDay() !== 0) {
    target.setDate(target.getDate() - 7);
  }
  return getWeekKeyFromDate(target);
}

export function getCurrentWeekCoachSessions(sessions: Session[], now: Date = new Date()): Session[] {
  const currentWeekKey = getCoachFeedbackWeekKey(now);
  return sessions
    .filter((session) => getWeekKeyFromDate(new Date(session.createdAt)) === currentWeekKey)
    .slice()
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

export function getCoachSessionSummaries(sessions: Session[]): CoachSessionAutoSummary[] {
  return sessions.map((session, index) => ({
    id: session.id,
    title: `Séance ${index + 1} · ${session.subtype}`,
    dateLabel: new Date(session.createdAt).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    }),
    distanceLabel: typeof session.distanceKm === 'number' ? `${session.distanceKm.toFixed(1)} km` : '--',
    durationLabel: formatDurationLabel(session.durationMin),
    paceLabel: formatPaceLabel(session.distanceKm, session.durationMin),
    rpe: session.feelings.rpe,
    fatigue: session.feelings.fatigue
  }));
}

export function buildCoachFeedbackTextFromSessions(
  weekNumber: number,
  sessions: Session[],
  now: Date = new Date()
): string {
  const summaries = getCoachSessionSummaries(sessions);
  const totalDistance = sessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
  const totalDuration = sessions.reduce((sum, session) => sum + session.durationMin, 0);
  const avgRpe = sessions.length
    ? sessions.reduce((sum, session) => sum + session.feelings.rpe, 0) / sessions.length
    : 0;
  const avgFatigue = sessions.length
    ? sessions.reduce((sum, session) => sum + session.feelings.fatigue, 0) / sessions.length
    : 0;

  return [
    '=== RETOUR DE SEMAINE ===',
    ...summaries.flatMap((session) => [
      '',
      `--- ${session.title} ---`,
      `Date: ${session.dateLabel}`,
      `Distances: ${session.distanceLabel}`,
      `Temps: ${session.durationLabel}`,
      `Rythme (min/km): ${session.paceLabel}`,
      `RPE moyen: ${session.rpe}`,
      `Fatigue (1-5): ${session.fatigue}`,
      'Note libre séance: Retour généré automatiquement depuis la séance enregistrée.'
    ]),
    '',
    '=== RETOUR GÉNÉRAL ===',
    `Semaine: ${weekNumber}`,
    `Séances réalisées: ${sessions.length}`,
    `Distance totale: ${totalDistance.toFixed(1)} km`,
    `Temps total: ${formatDurationLabel(totalDuration)}`,
    `RPE moyen semaine: ${avgRpe.toFixed(1)}`,
    `Fatigue moyenne semaine: ${avgFatigue.toFixed(1)}/5`,
    'Sensations générales: Retour automatique basé sur les séances enregistrées dans l’application.',
    'Notes libres sur la semaine: Aucune note libre.',
    `Généré le: ${now.toLocaleString('fr-FR')}`
  ].join('\n');
}

function mapProgramRow(row: CoachProgramRow): CoachProgramSummary {
  return {
    id: row.id,
    weekNumber: row.week_number,
    title: (row.title ?? '').trim() || `Programme semaine ${row.week_number}`,
    description: (row.description ?? '').trim(),
    storageBucket: normalizeBucketName((row.storage_bucket ?? '').trim() || DEFAULT_STORAGE_BUCKET),
    storagePath: row.storage_path,
    publishedAt: row.published_at
  };
}

function normalizeStoragePath(inputPath: string, bucket: string): string {
  const raw = inputPath.trim();
  if (!raw) return raw;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      const marker = '/storage/v1/object/';
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const tail = url.pathname.slice(markerIndex + marker.length);
        const parts = tail.split('/').filter(Boolean);
        if (parts.length >= 3) {
          const bucketFromUrl = parts[1];
          const objectPath = decodeURIComponent(parts.slice(2).join('/'));
          if (bucketFromUrl === bucket) return objectPath;
        }
      }
    } catch {
      return raw;
    }
  }

  const withoutLeadingSlash = raw.replace(/^\/+/, '');
  const bucketPrefix = `${bucket}/`;
  if (withoutLeadingSlash.startsWith(bucketPrefix)) {
    return withoutLeadingSlash.slice(bucketPrefix.length);
  }
  return withoutLeadingSlash;
}

function asDirectSignedUrl(inputPath: string): string | null {
  const raw = inputPath.trim();
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) return null;
  try {
    const url = new URL(raw);
    const isSupabaseSignedObject = url.pathname.includes('/storage/v1/object/sign/');
    if (!isSupabaseSignedObject) return null;
    if (!url.searchParams.get('token')) return null;
    return raw;
  } catch {
    return null;
  }
}

export async function getCoachHubData(): Promise<{ ok: boolean; data?: CoachHubData; error?: string }> {
  if (!canUseCoachCloud()) {
    return { ok: false, error: 'Coach indisponible: active la synchronisation cloud.' };
  }
  const userId = getSessionUserId();
  if (!userId) {
    return { ok: false, error: 'Connecte-toi pour accéder à Coach.' };
  }

  const intakePromise = supabase!
    .from('coach_intakes')
    .select('completed_at')
    .eq('user_id', userId)
    .maybeSingle();
  const programsPromise = supabase!
    .from('coach_programs')
    .select('id, week_number, title, description, storage_bucket, storage_path, published_at')
    .eq('user_id', userId)
    .eq('status', 'PUBLISHED')
    .order('week_number', { ascending: true });
  const feedbackPromise = supabase!
    .from('coach_feedbacks')
    .select('week_number, feedback_text, ready_for_next_week, submitted_at, delivery_status')
    .eq('user_id', userId);

  const [intakeRes, programsRes, feedbackRes] = await Promise.all([intakePromise, programsPromise, feedbackPromise]);
  if (intakeRes.error) return { ok: false, error: intakeRes.error.message };
  if (programsRes.error) return { ok: false, error: programsRes.error.message };
  if (feedbackRes.error) return { ok: false, error: feedbackRes.error.message };

  const programs = ((programsRes.data ?? []) as CoachProgramRow[]).map(mapProgramRow);
  const feedbackRows = (feedbackRes.data ?? []) as CoachFeedbackRow[];
  const sentFeedbackWeeks = new Set(
    feedbackRows
      .filter((row) => !row.delivery_status || row.delivery_status === 'SENT')
      .map((row) => row.week_number)
  );
  const firstPendingProgram = programs.find((program) => !sentFeedbackWeeks.has(program.weekNumber));
  const latestProgram = programs.length ? programs[programs.length - 1] : null;
  const activeProgram = firstPendingProgram ?? latestProgram ?? null;
  const activeFeedbackRow = activeProgram
    ? feedbackRows.find((row) => row.week_number === activeProgram.weekNumber) ?? null
    : null;

  return {
    ok: true,
    data: {
      intakeCompleted: Boolean(intakeRes.data),
      intakeCompletedAt: intakeRes.data?.completed_at ?? null,
      publishedPrograms: programs,
      activeProgram,
      feedbackAlreadySent: activeProgram
        ? Boolean(
            activeFeedbackRow && (!activeFeedbackRow.delivery_status || activeFeedbackRow.delivery_status === 'SENT')
          )
        : false,
      activeFeedback: activeFeedbackRow
        ? {
            weekNumber: activeFeedbackRow.week_number,
            feedbackText: activeFeedbackRow.feedback_text,
            readyForNextWeek: activeFeedbackRow.ready_for_next_week,
            submittedAt: activeFeedbackRow.submitted_at
          }
        : null
    }
  };
}

export async function saveCoachIntake(answers: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  if (!canUseCoachCloud()) {
    return { ok: false, error: 'Coach indisponible: active la synchronisation cloud.' };
  }
  const userId = getSessionUserId();
  if (!userId) {
    return { ok: false, error: 'Connecte-toi pour enregistrer ton questionnaire.' };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase!.from('coach_intakes').upsert(
    {
      user_id: userId,
      answers_json: answers,
      completed_at: nowIso,
      updated_at: nowIso
    },
    { onConflict: 'user_id' }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function openCoachProgramPdf(
  program: Pick<CoachProgramSummary, 'id' | 'storageBucket' | 'storagePath'>,
  expiresInSeconds = 900
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!canUseCoachCloud()) {
    return { ok: false, error: 'Coach indisponible: active la synchronisation cloud.' };
  }

  const normalizedBucket = normalizeBucketName(program.storageBucket);
  const directSignedUrl = asDirectSignedUrl(program.storagePath);
  if (directSignedUrl) {
    return { ok: true, url: directSignedUrl };
  }

  const { data: sessionData } = await supabase!.auth.getSession();
  const accessToken = sessionData.session?.access_token?.trim() ?? '';
  if (!accessToken) {
    return { ok: false, error: 'Session expirée. Reconnecte-toi pour ouvrir ton programme.' };
  }

  const invoke = await supabase!.functions.invoke<{
    url?: string;
    error?: string;
  }>('get-coach-program-url', {
    body: { programId: program.id, expiresIn: expiresInSeconds },
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!invoke.error && invoke.data?.url) {
    return { ok: true, url: invoke.data.url };
  }

  const normalizedPath = normalizeStoragePath(program.storagePath, normalizedBucket);
  const bucketCandidates = Array.from(new Set([normalizedBucket, DEFAULT_STORAGE_BUCKET, 'coach-programs']));
  let lastError = invoke.error?.message;
  for (const bucket of bucketCandidates) {
    const { data, error } = await supabase!.storage.from(bucket).createSignedUrl(normalizedPath, expiresInSeconds);
    if (!error && data?.signedUrl) return { ok: true, url: data.signedUrl };
    lastError = error?.message ?? lastError;
  }
  return { ok: false, error: invoke.data?.error ?? lastError ?? 'Programme PDF indisponible.' };
}

export async function submitCoachFeedback(input: {
  weekNumber: number;
  feedbackText: string;
  readyForNextWeek: boolean;
}): Promise<{ ok: boolean; error?: string; warning?: string }> {
  if (!canUseCoachCloud()) {
    return { ok: false, error: 'Coach indisponible: active la synchronisation cloud.' };
  }
  const user = getCurrentSessionUser();
  const userId = user?.id ?? null;
  if (!userId || !user?.email) {
    return { ok: false, error: 'Connecte-toi pour envoyer ton retour.' };
  }

  const trimmedFeedback = input.feedbackText.trim();
  const payload = {
    user_id: userId,
    week_number: input.weekNumber,
    feedback_text: trimmedFeedback,
    ready_for_next_week: input.readyForNextWeek,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    delivery_status: 'PENDING',
    delivery_mode: 'MANUAL',
    emailed_at: null,
    delivery_error: null
  };

  const { error } = await supabase!.from('coach_feedbacks').upsert(payload, {
    onConflict: 'user_id,week_number'
  });
  if (error) return { ok: false, error: error.message };

  const coachMailSubject = `Coach - Retour semaine ${input.weekNumber} - ${user.handle}`;
  const coachMailMessage = [
    `Utilisateur: ${user.displayName} (@${user.handle})`,
    `Email compte: ${user.email}`,
    `Semaine: ${input.weekNumber}`,
    `Prêt semaine suivante: ${input.readyForNextWeek ? 'Oui' : 'Non'}`,
    '',
    'Retour:',
    trimmedFeedback
  ].join('\n');

  const notifyResult = await supabase!.functions.invoke<{ ok?: boolean; error?: string }>('send-contact-email', {
    body: {
      replyEmail: user.email,
      senderName: `${user.displayName} (@${user.handle})`,
      subject: coachMailSubject,
      message: coachMailMessage
    }
  });

  if (notifyResult.error || !notifyResult.data?.ok) {
    const fallback = await sendContactEmail({
      replyEmail: user.email,
      senderName: `${user.displayName} (@${user.handle})`,
      subject: coachMailSubject,
      message: coachMailMessage
    });
    if (fallback.ok) {
      await supabase!
        .from('coach_feedbacks')
        .update({
          delivery_status: 'SENT',
          emailed_at: new Date().toISOString(),
          delivery_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('week_number', input.weekNumber);
      return { ok: true };
    }
    await supabase!
      .from('coach_feedbacks')
      .update({
        delivery_status: 'ERROR',
        emailed_at: null,
        delivery_error: fallback.error ?? notifyResult.error?.message ?? 'mail_failed',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('week_number', input.weekNumber);
    return {
      ok: true,
      warning:
        'Retour enregistré, mais l’email coach n’a pas pu être envoyé. Vérifie les secrets de la function send-contact-email.'
    };
  }

  await supabase!
    .from('coach_feedbacks')
    .update({
      delivery_status: 'SENT',
      emailed_at: new Date().toISOString(),
      delivery_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('week_number', input.weekNumber);

  return { ok: true };
}

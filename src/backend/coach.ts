import { getCurrentSessionUser, isRemoteAuthEnabledLocal } from './localAuth';
import { sendContactEmail } from './contactEmail';
import { supabase } from './supabaseClient';

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
  activeProgram: CoachProgramSummary | null;
  feedbackAlreadySent: boolean;
  activeFeedback: {
    weekNumber: number;
    feedbackText: string;
    readyForNextWeek: boolean;
    submittedAt: string;
  } | null;
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
};

const DEFAULT_STORAGE_BUCKET = (import.meta.env.VITE_COACH_STORAGE_BUCKET ?? 'coach-programs').trim();

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
    .select('week_number, feedback_text, ready_for_next_week, submitted_at')
    .eq('user_id', userId);

  const [intakeRes, programsRes, feedbackRes] = await Promise.all([intakePromise, programsPromise, feedbackPromise]);
  if (intakeRes.error) return { ok: false, error: intakeRes.error.message };
  if (programsRes.error) return { ok: false, error: programsRes.error.message };
  if (feedbackRes.error) return { ok: false, error: feedbackRes.error.message };

  const programs = ((programsRes.data ?? []) as CoachProgramRow[]).map(mapProgramRow);
  const feedbackRows = (feedbackRes.data ?? []) as CoachFeedbackRow[];
  const feedbackWeeks = new Set(feedbackRows.map((row) => row.week_number));
  const firstPendingProgram = programs.find((program) => !feedbackWeeks.has(program.weekNumber));
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
      activeProgram,
      feedbackAlreadySent: activeProgram ? feedbackWeeks.has(activeProgram.weekNumber) : false,
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
    updated_at: new Date().toISOString()
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
      return { ok: true };
    }
    return {
      ok: true,
      warning:
        'Retour enregistré, mais l’email coach n’a pas pu être envoyé. Vérifie les secrets de la function send-contact-email.'
    };
  }

  return { ok: true };
}

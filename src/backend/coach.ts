import { getCurrentSessionUser, isRemoteAuthEnabledLocal } from './localAuth';
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
};

const DEFAULT_STORAGE_BUCKET = (import.meta.env.VITE_COACH_STORAGE_BUCKET ?? 'coach-programs').trim();

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
    storageBucket: (row.storage_bucket ?? '').trim() || DEFAULT_STORAGE_BUCKET,
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
    .select('week_number')
    .eq('user_id', userId);

  const [intakeRes, programsRes, feedbackRes] = await Promise.all([intakePromise, programsPromise, feedbackPromise]);
  if (intakeRes.error) return { ok: false, error: intakeRes.error.message };
  if (programsRes.error) return { ok: false, error: programsRes.error.message };
  if (feedbackRes.error) return { ok: false, error: feedbackRes.error.message };

  const programs = ((programsRes.data ?? []) as CoachProgramRow[]).map(mapProgramRow);
  const feedbackWeeks = new Set(((feedbackRes.data ?? []) as CoachFeedbackRow[]).map((row) => row.week_number));
  const firstPendingProgram = programs.find((program) => !feedbackWeeks.has(program.weekNumber));
  const latestProgram = programs.length ? programs[programs.length - 1] : null;
  const activeProgram = firstPendingProgram ?? latestProgram ?? null;

  return {
    ok: true,
    data: {
      intakeCompleted: Boolean(intakeRes.data),
      intakeCompletedAt: intakeRes.data?.completed_at ?? null,
      activeProgram,
      feedbackAlreadySent: activeProgram ? feedbackWeeks.has(activeProgram.weekNumber) : false
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
  program: Pick<CoachProgramSummary, 'storageBucket' | 'storagePath'>,
  expiresInSeconds = 900
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!canUseCoachCloud()) {
    return { ok: false, error: 'Coach indisponible: active la synchronisation cloud.' };
  }

  const normalizedPath = normalizeStoragePath(program.storagePath, program.storageBucket);
  const { data, error } = await supabase!
    .storage.from(program.storageBucket)
    .createSignedUrl(normalizedPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'Programme PDF indisponible.' };
  }
  return { ok: true, url: data.signedUrl };
}

export async function submitCoachFeedback(input: {
  weekNumber: number;
  feedbackText: string;
  readyForNextWeek: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (!canUseCoachCloud()) {
    return { ok: false, error: 'Coach indisponible: active la synchronisation cloud.' };
  }
  const userId = getSessionUserId();
  if (!userId) {
    return { ok: false, error: 'Connecte-toi pour envoyer ton retour.' };
  }

  const payload = {
    user_id: userId,
    week_number: input.weekNumber,
    feedback_text: input.feedbackText.trim(),
    ready_for_next_week: input.readyForNextWeek,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase!.from('coach_feedbacks').upsert(payload, {
    onConflict: 'user_id,week_number'
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

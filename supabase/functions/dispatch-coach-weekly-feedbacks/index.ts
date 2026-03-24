import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

type CoachProgramRow = {
  id: string;
  user_id: string;
  week_number: number;
  status: 'DRAFT' | 'PUBLISHED';
};

type CoachFeedbackRow = {
  id: string;
  user_id: string;
  week_number: number;
  delivery_status: 'PENDING' | 'SENT' | 'ERROR' | null;
};

type UserAppStateRow = {
  user_id: string;
  state_json: {
    sessions?: SessionLike[];
  } | null;
};

type UserProfileRow = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
};

type SessionLike = {
  id?: string;
  createdAt?: string;
  created_at?: string;
  subtype?: string;
  distanceKm?: number;
  distance_km?: number;
  durationMin?: number;
  duration_min?: number;
  feelings?: {
    rpe?: number;
    fatigue?: number;
  } | null;
};

function json(data: Record<string, unknown>, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(init.headers ?? {})
    }
  });
}

function toISOWeekNumber(date: Date): { year: number; week: number } {
  const tmp = new Date(date);
  tmp.setHours(0, 0, 0, 0);
  const day = tmp.getDay() || 7;
  tmp.setDate(tmp.getDate() + 4 - day);
  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const diffDays = Math.floor((tmp.getTime() - yearStart.getTime()) / 86400000) + 1;
  return { year: tmp.getFullYear(), week: Math.ceil(diffDays / 7) };
}

function getWeekKeyFromDate(date: Date): string {
  const { year, week } = toISOWeekNumber(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function formatDurationLabel(durationMin: number): string {
  const rounded = Math.max(0, Math.round(durationMin));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h${String(minutes).padStart(2, '0')}`;
}

function formatPaceLabel(distanceKm: number | undefined, durationMin: number): string {
  if (!distanceKm || distanceKm <= 0 || !Number.isFinite(durationMin) || durationMin <= 0) return '--';
  const pace = durationMin / distanceKm;
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}/km`;
}

function getParisClock(now = new Date()): {
  weekday: string;
  hour: number;
  minute: number;
  dateForWeekKey: Date;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  return {
    weekday: map.weekday ?? '',
    hour,
    minute,
    dateForWeekKey: new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  };
}

function getCoachFeedbackWeekKeyFromParisClock(clock: ReturnType<typeof getParisClock>): string {
  const target = new Date(clock.dateForWeekKey);
  if (clock.weekday !== 'Sun') {
    target.setUTCDate(target.getUTCDate() - 7);
  }
  return getWeekKeyFromDate(target);
}

function isDeliverySent(status: string | null | undefined): boolean {
  if (!status) return true;
  return status === 'SENT';
}

function normalizeSession(raw: SessionLike, fallbackIndex: number): {
  id: string;
  createdAt: string;
  subtype: string;
  distanceKm?: number;
  durationMin: number;
  rpe: number;
  fatigue: number;
} | null {
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : typeof raw.created_at === 'string' ? raw.created_at : '';
  const createdAtDate = new Date(createdAt);
  if (!createdAt || Number.isNaN(createdAtDate.getTime())) return null;

  const durationMin =
    typeof raw.durationMin === 'number'
      ? raw.durationMin
      : typeof raw.duration_min === 'number'
        ? raw.duration_min
        : 0;
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null;

  const distanceKm =
    typeof raw.distanceKm === 'number'
      ? raw.distanceKm
      : typeof raw.distance_km === 'number'
        ? raw.distance_km
        : undefined;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `session-${fallbackIndex}`,
    createdAt,
    subtype: typeof raw.subtype === 'string' && raw.subtype ? raw.subtype : 'RUN',
    distanceKm: typeof distanceKm === 'number' && Number.isFinite(distanceKm) ? distanceKm : undefined,
    durationMin,
    rpe: Math.max(1, Math.min(10, Math.round(raw.feelings?.rpe ?? 5))),
    fatigue: Math.max(1, Math.min(5, Math.round(raw.feelings?.fatigue ?? 3)))
  };
}

function getCurrentWeekSessions(
  sessions: SessionLike[] | undefined,
  weekKey: string
): Array<ReturnType<typeof normalizeSession> extends infer T ? Exclude<T, null> : never> {
  if (!Array.isArray(sessions)) return [];
  return sessions
    .map((session, index) => normalizeSession(session, index))
    .filter((session): session is Exclude<ReturnType<typeof normalizeSession>, null> => Boolean(session))
    .filter((session) => getWeekKeyFromDate(new Date(session.createdAt)) === weekKey)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

function buildCoachFeedbackTextFromSessions(weekNumber: number, sessions: ReturnType<typeof getCurrentWeekSessions>): string {
  const totalDistance = sessions.reduce((sum, session) => sum + (session.distanceKm ?? 0), 0);
  const totalDuration = sessions.reduce((sum, session) => sum + session.durationMin, 0);
  const avgRpe = sessions.length ? sessions.reduce((sum, session) => sum + session.rpe, 0) / sessions.length : 0;
  const avgFatigue = sessions.length
    ? sessions.reduce((sum, session) => sum + session.fatigue, 0) / sessions.length
    : 0;

  return [
    '=== RETOUR DE SEMAINE ===',
    ...sessions.flatMap((session, index) => [
      '',
      `--- Séance ${index + 1} · ${session.subtype} ---`,
      `Date: ${new Date(session.createdAt).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}`,
      `Distances: ${typeof session.distanceKm === 'number' ? `${session.distanceKm.toFixed(1)} km` : '--'}`,
      `Temps: ${formatDurationLabel(session.durationMin)}`,
      `Rythme (min/km): ${formatPaceLabel(session.distanceKm, session.durationMin)}`,
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
    `Généré le: ${new Date().toLocaleString('fr-FR')}`
  ].join('\n');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const cronSecret = (Deno.env.get('COACH_CRON_SECRET') ?? '').trim();
  const requestSecret = (request.headers.get('x-cron-secret') ?? '').trim();
  if (!cronSecret || requestSecret !== cronSecret) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const force = request.method === 'POST'
    ? await request
        .json()
        .then((data) => Boolean((data as { force?: boolean }).force))
        .catch(() => false)
    : false;

  const { weekday, hour, minute, dateForWeekKey } = getParisClock(new Date());
  if (!force) {
    const afterDeadline = hour > 20 || (hour === 20 && minute >= 30);
    if (weekday !== 'Sun' || !afterDeadline) {
      return json({
        ok: true,
        skipped: true,
        reason: 'outside_dispatch_window',
        parisWeekday: weekday,
        parisHour: hour,
        parisMinute: minute
      });
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const toEmail = Deno.env.get('CONTACT_TO_EMAIL') ?? '';
  const fromEmail = Deno.env.get('CONTACT_FROM_EMAIL') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'missing_supabase_service_role' }, { status: 500 });
  }
  if (!resendApiKey || !toEmail || !fromEmail) {
    return json({ error: 'missing_mail_secrets' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const resend = new Resend(resendApiKey);
  const feedbackWeekKey = getCoachFeedbackWeekKeyFromParisClock({ weekday, hour, minute, dateForWeekKey });

  const [programsRes, feedbacksRes, statesRes, profilesRes, intakesRes] = await Promise.all([
    supabase.from('coach_programs').select('id,user_id,week_number,status').eq('status', 'PUBLISHED').order('week_number', { ascending: true }),
    supabase.from('coach_feedbacks').select('id,user_id,week_number,delivery_status'),
    supabase.from('user_app_state').select('user_id,state_json'),
    supabase.from('user_public_profiles').select('user_id,display_name,handle'),
    supabase.from('coach_intakes').select('user_id')
  ]);

  if (programsRes.error) return json({ error: programsRes.error.message }, { status: 500 });
  if (feedbacksRes.error) return json({ error: feedbacksRes.error.message }, { status: 500 });
  if (statesRes.error) return json({ error: statesRes.error.message }, { status: 500 });
  if (profilesRes.error) return json({ error: profilesRes.error.message }, { status: 500 });
  if (intakesRes.error) return json({ error: intakesRes.error.message }, { status: 500 });

  const intakeUserIds = new Set((intakesRes.data ?? []).map((row) => row.user_id as string));
  const latestProgramByUser = new Map<string, CoachProgramRow>();
  for (const row of (programsRes.data ?? []) as CoachProgramRow[]) {
    if (!intakeUserIds.has(row.user_id)) continue;
    latestProgramByUser.set(row.user_id, row);
  }

  const feedbackByUserWeek = new Map<string, CoachFeedbackRow>();
  for (const row of (feedbacksRes.data ?? []) as CoachFeedbackRow[]) {
    feedbackByUserWeek.set(`${row.user_id}:${row.week_number}`, row);
  }

  const stateByUser = new Map<string, UserAppStateRow>();
  for (const row of (statesRes.data ?? []) as UserAppStateRow[]) {
    stateByUser.set(row.user_id, row);
  }

  const profileByUser = new Map<string, UserProfileRow>();
  for (const row of (profilesRes.data ?? []) as UserProfileRow[]) {
    profileByUser.set(row.user_id, row);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const [userId, program] of latestProgramByUser.entries()) {
    const existingFeedback = feedbackByUserWeek.get(`${userId}:${program.week_number}`);
    if (existingFeedback && isDeliverySent(existingFeedback.delivery_status)) {
      continue;
    }

    const state = stateByUser.get(userId)?.state_json;
    const currentWeekSessions = getCurrentWeekSessions(state?.sessions, feedbackWeekKey);
    if (!currentWeekSessions.length) {
      results.push({ userId, weekNumber: program.week_number, status: 'skipped', reason: 'no_sessions' });
      continue;
    }

    const userRes = await supabase.auth.admin.getUserById(userId);
    const userEmail = userRes.data.user?.email?.trim() ?? '';
    if (!userEmail) {
      await supabase.from('coach_feedbacks').upsert(
        {
          user_id: userId,
          week_number: program.week_number,
          feedback_text: buildCoachFeedbackTextFromSessions(program.week_number, currentWeekSessions),
          ready_for_next_week: true,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          delivery_status: 'ERROR',
          delivery_mode: 'AUTO',
          emailed_at: null,
          delivery_error: 'missing_user_email'
        },
        { onConflict: 'user_id,week_number' }
      );
      results.push({ userId, weekNumber: program.week_number, status: 'error', reason: 'missing_user_email' });
      continue;
    }

    const profile = profileByUser.get(userId);
    const displayName =
      (profile?.display_name ?? '').trim() ||
      (userRes.data.user?.user_metadata?.display_name as string | undefined)?.trim() ||
      userEmail.split('@')[0];
    const handle =
      (profile?.handle ?? '').trim() ||
      (userRes.data.user?.user_metadata?.handle as string | undefined)?.trim() ||
      displayName.replace(/\s+/g, '_').toLowerCase();
    const feedbackText = buildCoachFeedbackTextFromSessions(program.week_number, currentWeekSessions);

    const upsertBase = {
      user_id: userId,
      week_number: program.week_number,
      feedback_text: feedbackText,
      ready_for_next_week: true,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      delivery_mode: 'AUTO'
    };

    const { error: pendingError } = await supabase.from('coach_feedbacks').upsert(
      {
        ...upsertBase,
        delivery_status: 'PENDING',
        emailed_at: null,
        delivery_error: null
      },
      { onConflict: 'user_id,week_number' }
    );
    if (pendingError) {
      results.push({ userId, weekNumber: program.week_number, status: 'error', reason: pendingError.message });
      continue;
    }

    const mailSubject = `Coach - Retour semaine ${program.week_number} - ${handle}`;
    const mailText = [
      `Utilisateur: ${displayName} (@${handle})`,
      `Email compte: ${userEmail}`,
      `Semaine: ${program.week_number}`,
      'Prêt semaine suivante: Oui',
      '',
      'Retour:',
      feedbackText
    ].join('\n');

    const { error: mailError } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      reply_to: userEmail,
      subject: `[NIVELR] ${mailSubject}`,
      text: mailText
    });

    if (mailError) {
      await supabase.from('coach_feedbacks').upsert(
        {
          ...upsertBase,
          delivery_status: 'ERROR',
          emailed_at: null,
          delivery_error: mailError.message
        },
        { onConflict: 'user_id,week_number' }
      );
      results.push({ userId, weekNumber: program.week_number, status: 'error', reason: mailError.message });
      continue;
    }

    await supabase.from('coach_feedbacks').upsert(
      {
        ...upsertBase,
        delivery_status: 'SENT',
        emailed_at: new Date().toISOString(),
        delivery_error: null
      },
      { onConflict: 'user_id,week_number' }
    );
    results.push({ userId, weekNumber: program.week_number, status: 'sent', sessions: currentWeekSessions.length });
  }

  return json({
    ok: true,
    force,
    currentWeekKey: feedbackWeekKey,
    processed: results.length,
    results
  });
});

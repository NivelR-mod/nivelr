import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

function normalizeAdminEmail(input: string): string {
  const email = input.trim().toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [localPart, domain] = parts;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const localWithoutAlias = localPart.split('+')[0].replace(/\./g, '');
    return `${localWithoutAlias}@gmail.com`;
  }
  return email;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'missing_supabase_service_role' }, { status: 500 });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!accessToken) {
    return json({ error: 'missing_access_token' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const authUser = await supabase.auth.getUser(accessToken);
  if (authUser.error || !authUser.data.user?.id || !authUser.data.user.email) {
    return json({ error: 'invalid_access_token' }, { status: 401 });
  }

  const allowedAdminEmails = (Deno.env.get('MODO_ADMIN_EMAIL') ?? 'nivelr2026@gmail.com')
    .split(',')
    .map((item) => normalizeAdminEmail(item))
    .filter(Boolean);
  const requesterEmail = normalizeAdminEmail(authUser.data.user.email);
  if (!allowedAdminEmails.includes(requesterEmail)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const userId = String(formData.get('userId') ?? '').trim();
  const weekNumber = Number(String(formData.get('weekNumber') ?? '').trim());
  const file = formData.get('file');

  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return json({ error: 'invalid_user_id' }, { status: 400 });
  }
  if (!Number.isInteger(weekNumber) || weekNumber <= 0) {
    return json({ error: 'invalid_week_number' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return json({ error: 'missing_file' }, { status: 400 });
  }

  const storagePath = `users/${userId}/week-${weekNumber}.pdf`;
  const upload = await supabase.storage.from('coach-programs').upload(storagePath, file, {
    upsert: true,
    contentType: file.type || 'application/pdf'
  });

  if (upload.error) {
    return json({ error: 'storage_upload_failed', detail: upload.error.message }, { status: 500 });
  }

  const upsert = await supabase.from('coach_programs').upsert(
    {
      user_id: userId,
      week_number: weekNumber,
      title: `Programme semaine ${weekNumber}`,
      storage_bucket: 'coach-programs',
      storage_path: storagePath,
      status: 'PUBLISHED',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id,week_number' }
  );

  if (upsert.error) {
    return json({ error: 'coach_program_upsert_failed', detail: upsert.error.message }, { status: 500 });
  }

  return json({
    ok: true,
    userId,
    weekNumber,
    storagePath
  });
});

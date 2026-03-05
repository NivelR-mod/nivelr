import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { Resend } from 'npm:resend@4.0.0';

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

function clean(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
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
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const toEmail = Deno.env.get('CONTACT_TO_EMAIL') ?? '';
  const fromEmail = Deno.env.get('CONTACT_FROM_EMAIL') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'missing_server_secrets' }, { status: 500 });
  }

  if (!resendApiKey || !toEmail || !fromEmail) {
    return json({ error: 'missing_mail_secrets' }, { status: 500 });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'unauthorized' }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const reasonCategory = clean(payload.reasonCategory);
  const reasonDetail = clean(payload.reasonDetail);
  if (!reasonCategory || !reasonDetail) {
    return json({ error: 'missing_reason' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user?.id || !userData.user.email) {
    return json({ error: 'invalid_user_token' }, { status: 401 });
  }

  const user = userData.user;
  const displayName = clean(user.user_metadata?.display_name) || clean(user.user_metadata?.full_name) || 'Utilisateur';

  const resend = new Resend(resendApiKey);
  const { error: sendError } = await resend.emails.send({
    from: fromEmail,
    to: [toEmail],
    reply_to: user.email,
    subject: `[NIVELR] Suppression compte - ${displayName}`,
    text: [
      'Demande de suppression de compte',
      `User ID: ${user.id}`,
      `Email: ${user.email}`,
      `Nom: ${displayName}`,
      `Raison (catégorie): ${reasonCategory}`,
      `Raison (détail): ${reasonDetail}`,
      `Date: ${new Date().toISOString()}`
    ].join('\n')
  });

  if (sendError) {
    return json({ error: 'resend_error', detail: sendError.message }, { status: 502 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
  if (deleteError) {
    return json({ error: 'delete_failed', detail: deleteError.message }, { status: 500 });
  }

  return json({ ok: true });
});

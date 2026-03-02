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

  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const toEmail = Deno.env.get('CONTACT_TO_EMAIL') ?? '';
  const fromEmail = Deno.env.get('CONTACT_FROM_EMAIL') ?? '';

  if (!resendApiKey || !toEmail || !fromEmail) {
    return json({ error: 'missing_server_secrets' }, { status: 500 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const replyEmail = clean(payload.replyEmail).toLowerCase();
  const subject = clean(payload.subject);
  const message = clean(payload.message);
  const senderName = clean(payload.senderName) || 'Utilisateur NIVELR';

  if (!replyEmail.includes('@')) return json({ error: 'invalid_reply_email' }, { status: 400 });
  if (!subject) return json({ error: 'missing_subject' }, { status: 400 });
  if (message.length < 10) return json({ error: 'message_too_short' }, { status: 400 });

  const resend = new Resend(resendApiKey);

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      reply_to: replyEmail,
      subject: `[NIVELR] ${subject}`,
      text: `Nom: ${senderName}\nEmail: ${replyEmail}\nObjet: ${subject}\n\nMessage:\n${message}`
    });

    if (error) {
      return json({ error: 'resend_error', detail: error.message }, { status: 502 });
    }

    return json({ ok: true });
  } catch {
    return json({ error: 'send_failed' }, { status: 502 });
  }
});

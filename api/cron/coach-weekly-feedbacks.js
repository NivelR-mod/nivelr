export default async function handler(req, res) {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.authorization || '').trim();

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const coachCronSecret = (process.env.COACH_CRON_SECRET || '').trim();

  if (!supabaseUrl || !coachCronSecret) {
    return res.status(500).json({ ok: false, error: 'missing_env' });
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-coach-weekly-feedbacks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': coachCronSecret
      },
      body: JSON.stringify({
        source: 'vercel-cron'
      })
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    return res.status(response.status).json(payload);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : 'dispatch_failed'
    });
  }
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type CoachProgramRow = {
  id: string;
  user_id: string;
  status: string;
  storage_bucket: string | null;
  storage_path: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function normalizeStoragePath(rawPath: string, bucket: string): string {
  const raw = rawPath.trim();
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
  const prefix = `${bucket}/`;
  if (withoutLeadingSlash.startsWith(prefix)) {
    return withoutLeadingSlash.slice(prefix.length);
  }
  return withoutLeadingSlash;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'server_config_missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      programId?: string;
      expiresIn?: number;
    };
    const programId = body.programId?.trim();
    if (!programId) {
      return new Response(JSON.stringify({ error: 'program_id_required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const expiresIn = Number(body.expiresIn);
    const signedUrlTtl = Number.isFinite(expiresIn) ? Math.max(60, Math.min(3600, Math.round(expiresIn))) : 900;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'invalid_user_token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const userId = userData.user.id;

    const { data: program, error: programError } = await admin
      .from('coach_programs')
      .select('id,user_id,status,storage_bucket,storage_path')
      .eq('id', programId)
      .eq('user_id', userId)
      .eq('status', 'PUBLISHED')
      .maybeSingle<CoachProgramRow>();

    if (programError) {
      return new Response(JSON.stringify({ error: 'program_lookup_failed', detail: programError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!program) {
      return new Response(JSON.stringify({ error: 'program_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const bucket = (program.storage_bucket ?? '').trim() || 'coach-programs';
    const path = normalizeStoragePath(program.storage_path, bucket);
    const { data: signed, error: signedError } = await admin.storage.from(bucket).createSignedUrl(path, signedUrlTtl);
    if (signedError || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: 'sign_url_failed', detail: signedError?.message ?? null }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ url: signed.signedUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error';
    return new Response(JSON.stringify({ error: 'unexpected_error', detail }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

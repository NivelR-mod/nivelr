import { AppState } from '../types/models';
import { normalizeState } from '../state/appState';
import { supabase, supabaseReady } from '../lib/supabase';

export async function loadRemoteState(userId: string): Promise<{ state: AppState | null; error?: string }> {
  if (!supabaseReady || !supabase) return { state: null, error: 'supabase_not_configured' };
  const { data, error } = await supabase
    .from('user_app_state')
    .select('state_json')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { state: null, error: error.message };
  if (!data) return { state: null };

  return { state: normalizeState((data as { state_json?: unknown }).state_json) };
}

export async function saveRemoteState(userId: string, state: AppState): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseReady || !supabase) return { ok: false, error: 'supabase_not_configured' };

  const payload = {
    user_id: userId,
    state_json: state,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('user_app_state').upsert(payload, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

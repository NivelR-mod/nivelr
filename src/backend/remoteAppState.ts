import { AppState } from '../types/models';
import { normalizeState } from '../storage/localStore';
import { normalizeGamificationState } from '../gamification/storage';
import { GamificationState } from '../gamification/types';
import {
  canUseModoForCurrentSession,
  getCurrentSessionUser,
  isModoEnabledLocal,
  isRemoteAuthEnabledLocal
} from './localAuth';
import { supabase } from './supabaseClient';

interface RemoteStateRow {
  user_id: string;
  state_json: unknown;
  gamification_json: unknown;
  updated_at: string;
}

export interface RemoteAppStateDumpRow {
  userId: string;
  updatedAt: string;
  state: AppState;
  gamificationState: GamificationState;
}

export async function loadRemoteAppState(): Promise<
  | {
      status: 'ok';
      state: AppState;
      gamificationState: GamificationState;
      updatedAt: string;
    }
  | { status: 'not_found' }
  | { status: 'error'; error: string }
> {
  if (!isRemoteAuthEnabledLocal() || !supabase) return { status: 'error', error: 'remote_auth_disabled' };
  const session = getCurrentSessionUser();
  if (!session) return { status: 'error', error: 'no_session' };

  const { data, error } = await supabase
    .from('user_app_state')
    .select('user_id,state_json,gamification_json,updated_at')
    .eq('user_id', session.id)
    .maybeSingle();

  if (error) return { status: 'error', error: error.message };
  if (!data) return { status: 'not_found' };
  const row = data as RemoteStateRow;
  return {
    status: 'ok',
    state: normalizeState(row.state_json),
    gamificationState: normalizeGamificationState(row.gamification_json),
    updatedAt: row.updated_at
  };
}

export async function saveRemoteAppState(input: {
  state: AppState;
  gamificationState: GamificationState;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isRemoteAuthEnabledLocal() || !supabase) return { ok: false, error: 'remote_auth_disabled' };
  const session = getCurrentSessionUser();
  if (!session) return { ok: false, error: 'no_session' };

  const payload = {
    user_id: session.id,
    state_json: input.state,
    gamification_json: input.gamificationState,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('user_app_state').upsert(payload, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listRemoteAppStatesForAdmin(
  limit = 500
): Promise<{ rows: RemoteAppStateDumpRow[]; error?: string }> {
  if (!isRemoteAuthEnabledLocal() || !supabase) {
    return { rows: [], error: 'remote_auth_disabled' };
  }
  if (!canUseModoForCurrentSession() || !isModoEnabledLocal()) {
    return { rows: [], error: 'forbidden' };
  }

  const { data, error } = await supabase
    .from('user_app_state')
    .select('user_id,state_json,gamification_json,updated_at')
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(2000, Math.floor(limit))));

  if (error) return { rows: [], error: error.message };
  if (!Array.isArray(data)) return { rows: [], error: 'unexpected_response' };

  return {
    rows: (data as RemoteStateRow[]).map((row) => ({
      userId: row.user_id,
      updatedAt: row.updated_at,
      state: normalizeState(row.state_json),
      gamificationState: normalizeGamificationState(row.gamification_json)
    }))
  };
}

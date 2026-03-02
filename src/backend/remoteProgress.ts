import { supabase } from './supabaseClient';
import {
  canUseModoForCurrentSession,
  getCurrentSessionUser,
  isModoEnabledLocal,
  isRemoteAuthEnabledLocal
} from './localAuth';
import { RemoteUserProgressEntry } from './types';

const LAST_SYNC_STATUS_KEY = 'nivelr_remote_progress_last_sync';

interface ProgressRow {
  user_id: string;
  email: string;
  display_name: string;
  handle: string;
  level: number;
  xp_total: number;
  updated_at: string;
}

export async function syncCurrentUserProgressRemote(input: {
  level: number;
  xpTotal: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isRemoteAuthEnabledLocal() || !supabase) {
    localStorage.setItem(LAST_SYNC_STATUS_KEY, 'remote_auth_disabled');
    return { ok: false, error: 'remote_auth_disabled' };
  }
  const session = getCurrentSessionUser();
  if (!session) {
    localStorage.setItem(LAST_SYNC_STATUS_KEY, 'no_session');
    return { ok: false, error: 'no_session' };
  }

  const payload = {
    user_id: session.id,
    email: session.email,
    display_name: session.displayName,
    handle: session.handle,
    level: Math.max(1, Math.floor(input.level)),
    xp_total: Math.max(0, Math.round(input.xpTotal)),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('user_progress').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    console.warn('user_progress upsert error', error.message);
    localStorage.setItem(LAST_SYNC_STATUS_KEY, error.message);
    return { ok: false, error: error.message };
  }
  localStorage.setItem(LAST_SYNC_STATUS_KEY, `ok:${new Date().toISOString()}`);
  return { ok: true };
}

export async function listRemoteUserProgress(
  limit = 200
): Promise<{ rows: RemoteUserProgressEntry[]; error?: string }> {
  if (!isRemoteAuthEnabledLocal() || !supabase) {
    return { rows: [], error: 'remote_auth_disabled' };
  }
  if (!canUseModoForCurrentSession() || !isModoEnabledLocal()) {
    return { rows: [], error: 'forbidden' };
  }
  const { data, error } = await supabase
    .from('user_progress')
    .select('user_id,email,display_name,handle,level,xp_total,updated_at')
    .order('xp_total', { ascending: false })
    .limit(Math.max(1, Math.min(1000, Math.floor(limit))));

  if (error) {
    return { rows: [], error: error.message };
  }
  if (!Array.isArray(data)) {
    return { rows: [], error: 'unexpected_response' };
  }
  return {
    rows: (data as ProgressRow[]).map((row) => ({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      handle: row.handle,
      level: row.level,
      xpTotal: row.xp_total,
      updatedAt: row.updated_at
    }))
  };
}

export function getLastRemoteProgressSyncStatus(): string {
  try {
    return localStorage.getItem(LAST_SYNC_STATUS_KEY) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

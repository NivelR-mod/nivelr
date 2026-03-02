const AUTH_SESSION_KEY = 'nivelr_local_session_v1';

interface SessionLike {
  id?: unknown;
}

export function getCurrentUserScopeId(): string {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return 'guest';
    const parsed = JSON.parse(raw) as SessionLike;
    const id = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
    return id || 'guest';
  } catch {
    return 'guest';
  }
}

export function scopedStorageKey(baseKey: string): string {
  const scopeId = getCurrentUserScopeId();
  return `${baseKey}:${scopeId}`;
}

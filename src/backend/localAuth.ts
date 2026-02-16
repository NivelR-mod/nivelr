import { AuthSessionUser, ContactRequest } from './types';

interface StoredUser extends AuthSessionUser {
  password: string;
  bio?: string;
}

const USERS_KEY = 'nivelr_local_users_v1';
const SESSION_KEY = 'nivelr_local_session_v1';
const CONTACTS_KEY = 'nivelr_local_contacts_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeHandle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
    .slice(0, 24);
}

function toPublicUser(user: StoredUser): AuthSessionUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    handle: user.handle,
    createdAt: user.createdAt
  };
}

export function listLocalUsers(): AuthSessionUser[] {
  return readJson<StoredUser[]>(USERS_KEY, []).map(toPublicUser);
}

export function getCurrentSessionUser(): AuthSessionUser | null {
  return readJson<AuthSessionUser | null>(SESSION_KEY, null);
}

export function signOutLocal(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function signInLocal(email: string, password: string): { user: AuthSessionUser | null; error?: string } {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const user = users.find(
    (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password
  );
  if (!user) return { user: null, error: 'Identifiants invalides.' };
  const publicUser = toPublicUser(user);
  writeJson(SESSION_KEY, publicUser);
  return { user: publicUser };
}

export function signUpLocal(input: {
  email: string;
  password: string;
  displayName: string;
  handle?: string;
}): { user: AuthSessionUser | null; error?: string } {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) return { user: null, error: 'Email invalide.' };
  if (input.password.length < 6) return { user: null, error: 'Mot de passe trop court (min 6).' };
  if (users.some((item) => item.email === email)) return { user: null, error: 'Email déjà utilisé.' };

  const desiredHandle = normalizeHandle(input.handle || input.displayName || email.split('@')[0]);
  const handle = desiredHandle || `user${Date.now().toString().slice(-5)}`;
  if (users.some((item) => item.handle === handle)) {
    return { user: null, error: 'Handle déjà pris, choisis-en un autre.' };
  }

  const user: StoredUser = {
    id: `u_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    email,
    password: input.password,
    displayName: input.displayName.trim() || 'Utilisateur NIVELR',
    handle,
    createdAt: new Date().toISOString()
  };
  const nextUsers = [user, ...users];
  writeJson(USERS_KEY, nextUsers);
  const publicUser = toPublicUser(user);
  writeJson(SESSION_KEY, publicUser);
  return { user: publicUser };
}

export function updateProfileLocal(userId: string, patch: { displayName: string; handle: string }): {
  user: AuthSessionUser | null;
  error?: string;
} {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const handle = normalizeHandle(patch.handle);
  if (!handle) return { user: null, error: 'Handle invalide.' };
  if (users.some((item) => item.id !== userId && item.handle === handle)) {
    return { user: null, error: 'Handle déjà utilisé.' };
  }
  let updated: StoredUser | null = null;
  const nextUsers = users.map((item) => {
    if (item.id !== userId) return item;
    updated = {
      ...item,
      displayName: patch.displayName.trim() || item.displayName,
      handle
    };
    return updated;
  });
  writeJson(USERS_KEY, nextUsers);
  if (!updated) return { user: null, error: 'Utilisateur introuvable.' };
  const publicUser = toPublicUser(updated);
  writeJson(SESSION_KEY, publicUser);
  return { user: publicUser };
}

export function searchUsersLocal(query: string, currentUserId?: string): AuthSessionUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return listLocalUsers()
    .filter((user) => user.id !== currentUserId)
    .filter(
      (user) =>
        user.displayName.toLowerCase().includes(q) ||
        user.handle.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q)
    )
    .slice(0, 20);
}

function listContactsInternal(): ContactRequest[] {
  return readJson<ContactRequest[]>(CONTACTS_KEY, []);
}

function saveContactsInternal(next: ContactRequest[]): void {
  writeJson(CONTACTS_KEY, next);
}

export function listContactRequestsForUser(userId: string): {
  incoming: ContactRequest[];
  outgoing: ContactRequest[];
} {
  const all = listContactsInternal();
  return {
    incoming: all.filter((item) => item.targetUserId === userId),
    outgoing: all.filter((item) => item.requesterUserId === userId)
  };
}

export function sendContactRequestLocal(requesterUserId: string, targetUserId: string): {
  ok: boolean;
  error?: string;
} {
  if (!requesterUserId || !targetUserId || requesterUserId === targetUserId) {
    return { ok: false, error: 'Demande invalide.' };
  }
  const all = listContactsInternal();
  const exists = all.some(
    (item) =>
      (item.requesterUserId === requesterUserId && item.targetUserId === targetUserId) ||
      (item.requesterUserId === targetUserId && item.targetUserId === requesterUserId)
  );
  if (exists) return { ok: false, error: 'Demande déjà existante.' };

  const now = new Date().toISOString();
  const next: ContactRequest[] = [
    {
      id: `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      requesterUserId,
      targetUserId,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now
    },
    ...all
  ];
  saveContactsInternal(next);
  return { ok: true };
}

export function respondToContactRequestLocal(
  requestId: string,
  targetUserId: string,
  decision: 'ACCEPTED' | 'DECLINED'
): { ok: boolean; error?: string } {
  const all = listContactsInternal();
  let changed = false;
  const next = all.map((item) => {
    if (item.id !== requestId) return item;
    if (item.targetUserId !== targetUserId) return item;
    changed = true;
    return {
      ...item,
      status: decision,
      updatedAt: new Date().toISOString()
    };
  });
  if (!changed) return { ok: false, error: 'Demande introuvable.' };
  saveContactsInternal(next);
  return { ok: true };
}

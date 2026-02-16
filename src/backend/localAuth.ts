import { AuthSessionUser, ContactRequest, UserSubscriptionInfo } from './types';

interface StoredUser extends AuthSessionUser {
  password: string;
  bio?: string;
}

const USERS_KEY = 'nivelr_local_users_v1';
const SESSION_KEY = 'nivelr_local_session_v1';
const CONTACTS_KEY = 'nivelr_local_contacts_v1';
const SUBSCRIPTIONS_KEY = 'nivelr_local_subscriptions_v1';
const MODO_KEY = 'nivelr_modo_enabled';
const AUTH_CHANGED_EVENT = 'nivelr-auth-changed';
const RESERVED_STAFF_TERMS = [
  'nivelr',
  'modo',
  'moderateur',
  'modérateur',
  'moderation',
  'modération',
  'admin',
  'administrator',
  'staff',
  'support',
  'team'
];

function emitAuthChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export const LOCAL_AUTH_CHANGED_EVENT = AUTH_CHANGED_EVENT;

function isValidEmail(input: string): boolean {
  const email = input.trim().toLowerCase();
  return email.includes('@') && email.includes('.') && email.length >= 5;
}

function normalizeDisplayNameForCompare(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function validateDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (!trimmed || trimmed.length < 2) {
    return 'Pseudo invalide (minimum 2 caractères).';
  }
  const normalized = normalizeDisplayNameForCompare(trimmed);
  if (normalized.length < 2) {
    return 'Pseudo invalide.';
  }
  const hasReservedTerm = RESERVED_STAFF_TERMS.some((term) =>
    normalized.includes(
      term
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    )
  );
  if (hasReservedTerm) {
    return 'Ce pseudo est réservé.';
  }
  return null;
}

function getDefaultSubscription(): UserSubscriptionInfo {
  return {
    plan: 'FREE_S1',
    status: 'ACTIVE'
  };
}

function readSubscriptions(): Record<string, UserSubscriptionInfo> {
  return readJson<Record<string, UserSubscriptionInfo>>(SUBSCRIPTIONS_KEY, {});
}

function writeSubscriptions(next: Record<string, UserSubscriptionInfo>): void {
  writeJson(SUBSCRIPTIONS_KEY, next);
}

export function isModoEnabledLocal(): boolean {
  try {
    return localStorage.getItem(MODO_KEY) === '1';
  } catch {
    return false;
  }
}

export function setModoEnabledLocal(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem(MODO_KEY, '1');
  } else {
    localStorage.removeItem(MODO_KEY);
  }
  emitAuthChanged();
}

export function ensureModoSession(): AuthSessionUser {
  const existingSession = getCurrentSessionUser();
  if (existingSession) return existingSession;

  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const existingModoUser = users.find((user) => user.email === 'modo@nivelr.local');
  if (existingModoUser) {
    const publicUser = toPublicUser(existingModoUser);
    writeJson(SESSION_KEY, publicUser);
    emitAuthChanged();
    return publicUser;
  }

  const now = new Date().toISOString();
  const modoUser: StoredUser = {
    id: `modo_${Date.now()}`,
    email: 'modo@nivelr.local',
    password: 'modo',
    displayName: 'Modo NIVELR',
    handle: 'modo_nivelr',
    createdAt: now
  };
  writeJson(USERS_KEY, [modoUser, ...users]);
  const publicUser = toPublicUser(modoUser);
  writeJson(SESSION_KEY, publicUser);
  emitAuthChanged();
  return publicUser;
}

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

function generateUniqueHandle(baseLabel: string, users: StoredUser[], excludeUserId?: string): string {
  const normalizedBase = normalizeHandle(baseLabel) || `user${Date.now().toString().slice(-5)}`;
  let candidate = normalizedBase;
  let suffix = 1;
  while (users.some((item) => item.id !== excludeUserId && item.handle === candidate)) {
    suffix += 1;
    const suffixText = String(suffix);
    const maxBaseLength = Math.max(3, 24 - suffixText.length);
    candidate = `${normalizedBase.slice(0, maxBaseLength)}${suffixText}`;
  }
  return candidate;
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
  emitAuthChanged();
}

export function signInLocal(email: string, password: string): { user: AuthSessionUser | null; error?: string } {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const user = users.find(
    (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password
  );
  if (!user) return { user: null, error: 'Identifiants invalides.' };
  const publicUser = toPublicUser(user);
  writeJson(SESSION_KEY, publicUser);
  emitAuthChanged();
  return { user: publicUser };
}

export function signUpLocal(input: {
  email: string;
  password: string;
  displayName: string;
}): { user: AuthSessionUser | null; error?: string } {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { user: null, error: 'Email invalide.' };
  if (input.password.length < 6) return { user: null, error: 'Mot de passe trop court (min 6).' };
  if (users.some((item) => item.email === email)) return { user: null, error: 'Email déjà utilisé.' };
  const displayNameError = validateDisplayName(input.displayName);
  if (displayNameError) return { user: null, error: displayNameError };
  const normalizedDisplayName = normalizeDisplayNameForCompare(input.displayName);
  if (users.some((item) => normalizeDisplayNameForCompare(item.displayName) === normalizedDisplayName)) {
    return { user: null, error: 'Pseudo déjà utilisé.' };
  }

  const handle = generateUniqueHandle(input.displayName || email.split('@')[0], users);

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
  const subscriptions = readSubscriptions();
  writeSubscriptions({
    ...subscriptions,
    [user.id]: subscriptions[user.id] ?? getDefaultSubscription()
  });
  const publicUser = toPublicUser(user);
  writeJson(SESSION_KEY, publicUser);
  emitAuthChanged();
  return { user: publicUser };
}

export function updateProfileLocal(userId: string, patch: { displayName: string }): {
  user: AuthSessionUser | null;
  error?: string;
} {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const nextDisplayName = patch.displayName.trim();
  if (!nextDisplayName) return { user: null, error: 'Nom affiché invalide.' };
  const displayNameError = validateDisplayName(nextDisplayName);
  if (displayNameError) return { user: null, error: displayNameError };
  const normalizedDisplayName = normalizeDisplayNameForCompare(nextDisplayName);
  if (
    users.some(
      (item) =>
        item.id !== userId &&
        normalizeDisplayNameForCompare(item.displayName) === normalizedDisplayName
    )
  ) {
    return { user: null, error: 'Pseudo déjà utilisé.' };
  }
  let updated: StoredUser | null = null;
  const nextUsers = users.map((item) => {
    if (item.id !== userId) return item;
    const nextHandle = generateUniqueHandle(nextDisplayName, users, userId);
    updated = {
      ...item,
      displayName: nextDisplayName,
      handle: nextHandle
    };
    return updated;
  });
  writeJson(USERS_KEY, nextUsers);
  if (!updated) return { user: null, error: 'Utilisateur introuvable.' };
  const publicUser = toPublicUser(updated);
  writeJson(SESSION_KEY, publicUser);
  emitAuthChanged();
  return { user: publicUser };
}

export function updateAccountSecurityLocal(input: {
  userId: string;
  currentPassword: string;
  nextEmail?: string;
  nextPassword?: string;
}): { user: AuthSessionUser | null; error?: string; emailChanged?: boolean; passwordChanged?: boolean } {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const user = users.find((item) => item.id === input.userId);
  if (!user) return { user: null, error: 'Utilisateur introuvable.' };
  if (user.password !== input.currentPassword) {
    return { user: null, error: 'Mot de passe actuel incorrect.' };
  }

  const trimmedEmail = input.nextEmail?.trim().toLowerCase() ?? user.email;
  const trimmedPassword = input.nextPassword?.trim() ?? '';
  const wantsEmailChange = trimmedEmail !== user.email;
  const wantsPasswordChange = Boolean(trimmedPassword);

  if (!wantsEmailChange && !wantsPasswordChange) {
    return { user: null, error: 'Aucune modification détectée.' };
  }

  if (wantsEmailChange) {
    if (!isValidEmail(trimmedEmail)) return { user: null, error: 'Nouvel email invalide.' };
    if (users.some((item) => item.id !== user.id && item.email === trimmedEmail)) {
      return { user: null, error: 'Email déjà utilisé.' };
    }
  }

  if (wantsPasswordChange && trimmedPassword.length < 6) {
    return { user: null, error: 'Nouveau mot de passe trop court (min 6).' };
  }

  let updated: StoredUser | null = null;
  const nextUsers = users.map((item) => {
    if (item.id !== user.id) return item;
    updated = {
      ...item,
      email: trimmedEmail,
      password: wantsPasswordChange ? trimmedPassword : item.password
    };
    return updated;
  });

  writeJson(USERS_KEY, nextUsers);
  if (!updated) return { user: null, error: 'Mise à jour impossible.' };
  const publicUser = toPublicUser(updated);
  writeJson(SESSION_KEY, publicUser);
  emitAuthChanged();
  return {
    user: publicUser,
    emailChanged: wantsEmailChange,
    passwordChanged: wantsPasswordChange
  };
}

export function getUserSubscriptionLocal(userId: string): UserSubscriptionInfo {
  const subscriptions = readSubscriptions();
  if (subscriptions[userId]) return subscriptions[userId];
  const next = {
    ...subscriptions,
    [userId]: getDefaultSubscription()
  };
  writeSubscriptions(next);
  return next[userId];
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

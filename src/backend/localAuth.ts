import {
  AuthSessionUser,
  ContactRequest,
  MarketingContactEntry,
  TeamInvite,
  UserContactPreferences,
  UserSubscriptionInfo
} from './types';
import { BACKEND_FLAGS, BACKEND_PROVIDER } from './config';
import { SUPABASE_AUTH_READY, supabase } from './supabaseClient';

interface StoredUser extends AuthSessionUser {
  password: string;
  bio?: string;
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
}

const USERS_KEY = 'nivelr_local_users_v1';
const SESSION_KEY = 'nivelr_local_session_v1';
const CONTACTS_KEY = 'nivelr_local_contacts_v1';
const TEAM_INVITES_KEY = 'nivelr_local_team_invites_v1';
const SUBSCRIPTIONS_KEY = 'nivelr_local_subscriptions_v1';
const AVATARS_KEY = 'nivelr_local_avatars_v1';
const SIDEBAR_STATS_SCOPE_KEY_PREFIX = 'nivelr_sidebar_stats_scope_v1';
const MODO_KEY = 'nivelr_modo_enabled';
const AUTH_GUARD_KEY = 'nivelr_auth_guard_v1';
const AUTH_SIGNIN_WINDOW_MS = 15 * 60 * 1000;
const AUTH_SIGNIN_MAX_FAILURES = 8;
const AUTH_SIGNIN_BLOCK_MS = 15 * 60 * 1000;
const AUTH_SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const AUTH_SIGNUP_MAX_ATTEMPTS = 5;
const AUTH_SIGNUP_BLOCK_MS = 15 * 60 * 1000;
const MODO_ADMIN_EMAILS = (import.meta.env.VITE_MODO_ADMIN_EMAIL ?? 'nivelr2026@gmail.com')
  .split(',')
  .map((item: string) => item.trim())
  .filter(Boolean);

interface AuthGuardState {
  signInWindowStart: number;
  signInFailures: number;
  signInBlockedUntil: number;
  signUpWindowStart: number;
  signUpAttempts: number;
  signUpBlockedUntil: number;
}

export type SidebarStatsScope = 'WEEK' | 'MONTH' | 'TOTAL';

function normalizeEmailForAdmin(input: string): string {
  const email = input.trim().toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [localPart, domain] = parts;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const localWithoutAlias = localPart.split('+')[0].replace(/\./g, '');
    return `${localWithoutAlias}@gmail.com`;
  }
  return email;
}

function normalizeEmailForAuth(input: string): string {
  return normalizeEmailForAdmin(input);
}
const AUTH_CHANGED_EVENT = 'nivelr-auth-changed';
const FAKE_USER_ID_PREFIX = 'fake_';
const FAKE_USER_EMAIL_DOMAIN = '@sim.nivelr.local';
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

function readAuthGuardState(): AuthGuardState {
  try {
    const raw = localStorage.getItem(AUTH_GUARD_KEY);
    if (!raw) {
      return {
        signInWindowStart: 0,
        signInFailures: 0,
        signInBlockedUntil: 0,
        signUpWindowStart: 0,
        signUpAttempts: 0,
        signUpBlockedUntil: 0
      };
    }
    const parsed = JSON.parse(raw) as Partial<AuthGuardState>;
    return {
      signInWindowStart: Number(parsed.signInWindowStart) || 0,
      signInFailures: Number(parsed.signInFailures) || 0,
      signInBlockedUntil: Number(parsed.signInBlockedUntil) || 0,
      signUpWindowStart: Number(parsed.signUpWindowStart) || 0,
      signUpAttempts: Number(parsed.signUpAttempts) || 0,
      signUpBlockedUntil: Number(parsed.signUpBlockedUntil) || 0
    };
  } catch {
    return {
      signInWindowStart: 0,
      signInFailures: 0,
      signInBlockedUntil: 0,
      signUpWindowStart: 0,
      signUpAttempts: 0,
      signUpBlockedUntil: 0
    };
  }
}

function writeAuthGuardState(state: AuthGuardState): void {
  localStorage.setItem(AUTH_GUARD_KEY, JSON.stringify(state));
}

function formatWaitMinutes(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60000));
}

function checkAuthGuard(kind: 'signin' | 'signup'): string | null {
  const now = Date.now();
  const state = readAuthGuardState();
  if (kind === 'signin') {
    if (state.signInBlockedUntil > now) {
      return `Trop de tentatives de connexion. Réessaie dans ${formatWaitMinutes(state.signInBlockedUntil - now)} min.`;
    }
    if (now - state.signInWindowStart > AUTH_SIGNIN_WINDOW_MS) {
      state.signInWindowStart = now;
      state.signInFailures = 0;
      writeAuthGuardState(state);
    }
    return null;
  }
  if (state.signUpBlockedUntil > now) {
    return `Trop de tentatives d’inscription. Réessaie dans ${formatWaitMinutes(state.signUpBlockedUntil - now)} min.`;
  }
  if (now - state.signUpWindowStart > AUTH_SIGNUP_WINDOW_MS) {
    state.signUpWindowStart = now;
    state.signUpAttempts = 0;
    writeAuthGuardState(state);
  }
  return null;
}

function markSignInFailureGuard(): void {
  const now = Date.now();
  const state = readAuthGuardState();
  if (now - state.signInWindowStart > AUTH_SIGNIN_WINDOW_MS) {
    state.signInWindowStart = now;
    state.signInFailures = 0;
  }
  state.signInFailures += 1;
  if (state.signInFailures >= AUTH_SIGNIN_MAX_FAILURES) {
    state.signInBlockedUntil = now + AUTH_SIGNIN_BLOCK_MS;
    state.signInFailures = 0;
    state.signInWindowStart = now;
  }
  writeAuthGuardState(state);
}

function markSignInSuccessGuard(): void {
  const state = readAuthGuardState();
  state.signInFailures = 0;
  state.signInWindowStart = 0;
  state.signInBlockedUntil = 0;
  writeAuthGuardState(state);
}

function markSignUpAttemptGuard(success: boolean): void {
  const now = Date.now();
  const state = readAuthGuardState();
  if (success) {
    state.signUpAttempts = 0;
    state.signUpWindowStart = 0;
    state.signUpBlockedUntil = 0;
    writeAuthGuardState(state);
    return;
  }
  if (now - state.signUpWindowStart > AUTH_SIGNUP_WINDOW_MS) {
    state.signUpWindowStart = now;
    state.signUpAttempts = 0;
  }
  state.signUpAttempts += 1;
  if (state.signUpAttempts >= AUTH_SIGNUP_MAX_ATTEMPTS) {
    state.signUpBlockedUntil = now + AUTH_SIGNUP_BLOCK_MS;
    state.signUpAttempts = 0;
    state.signUpWindowStart = now;
  }
  writeAuthGuardState(state);
}

function toBooleanStrict(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'oui';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

function isUuidLikeId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function isInternalEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith('@nivelr.local') || normalized.endsWith(FAKE_USER_EMAIL_DOMAIN);
}

function sanitizeStoredUsersConsent(users: StoredUser[]): StoredUser[] {
  let changed = false;
  const next = users.map((user) => {
    const normalizedOptIn = toBooleanStrict(user.marketingOptIn);
    const normalizedOptInAt = normalizedOptIn ? user.marketingOptInAt : undefined;
    if (normalizedOptIn !== user.marketingOptIn || normalizedOptInAt !== user.marketingOptInAt) {
      changed = true;
      return {
        ...user,
        marketingOptIn: normalizedOptIn,
        marketingOptInAt: normalizedOptInAt
      };
    }
    return user;
  });
  if (changed) {
    writeJson(USERS_KEY, next);
  }
  return next;
}

const REMOTE_AUTH_ENABLED =
  BACKEND_PROVIDER === 'SUPABASE' && BACKEND_FLAGS.authEnabled && SUPABASE_AUTH_READY;

export function isRemoteAuthEnabledLocal(): boolean {
  return REMOTE_AUTH_ENABLED;
}

function emitAuthChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export const LOCAL_AUTH_CHANGED_EVENT = AUTH_CHANGED_EVENT;

export function getSidebarStatsScopeLocal(userId?: string | null): SidebarStatsScope {
  const key = `${SIDEBAR_STATS_SCOPE_KEY_PREFIX}:${(userId ?? 'guest').trim() || 'guest'}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'MONTH' || raw === 'TOTAL' || raw === 'WEEK') return raw;
    return 'WEEK';
  } catch {
    return 'WEEK';
  }
}

export function setSidebarStatsScopeLocal(
  userId: string,
  scope: SidebarStatsScope
): { ok: boolean; error?: string } {
  const next = scope === 'MONTH' || scope === 'TOTAL' ? scope : 'WEEK';
  const id = userId.trim();
  if (!id) return { ok: false, error: 'Session invalide.' };
  const key = `${SIDEBAR_STATS_SCOPE_KEY_PREFIX}:${id}`;
  try {
    localStorage.setItem(key, next);
    emitAuthChanged();
    return { ok: true };
  } catch {
    return { ok: false, error: 'Enregistrement impossible.' };
  }
}

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

function readAvatars(): Record<string, string> {
  return readJson<Record<string, string>>(AVATARS_KEY, {});
}

function writeAvatars(next: Record<string, string>): void {
  writeJson(AVATARS_KEY, next);
}

function getAvatarForUser(userId: string): string | undefined {
  const map = readAvatars();
  const value = map[userId];
  return typeof value === 'string' && value ? value : undefined;
}

function setAvatarForUser(userId: string, avatarDataUrl: string | null): void {
  const map = readAvatars();
  if (avatarDataUrl) {
    map[userId] = avatarDataUrl;
  } else {
    delete map[userId];
  }
  writeAvatars(map);
}

export function isModoEnabledLocal(): boolean {
  try {
    return localStorage.getItem(MODO_KEY) === '1';
  } catch {
    return false;
  }
}

export function isModoAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = normalizeEmailForAdmin(email);
  return MODO_ADMIN_EMAILS.map((item: string) => normalizeEmailForAdmin(item)).includes(normalized);
}

export function canUseModoForCurrentSession(): boolean {
  const session = getCurrentSessionUser();
  return isModoAdminEmail(session?.email ?? null);
}

export function setModoEnabledLocal(enabled: boolean): void {
  if (!canUseModoForCurrentSession()) {
    localStorage.removeItem(MODO_KEY);
    emitAuthChanged();
    return;
  }
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
    createdAt: now,
    marketingOptIn: false
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
    createdAt: user.createdAt,
    avatarDataUrl: user.avatarDataUrl ?? getAvatarForUser(user.id),
    marketingOptIn: toBooleanStrict(user.marketingOptIn),
    marketingOptInAt: user.marketingOptInAt
  };
}

function upsertLocalMirrorFromPublicUser(user: AuthSessionUser): void {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const existing = users.find((item) => item.id === user.id);
  const nextRecord: StoredUser = existing
    ? {
        ...existing,
        email: user.email,
        displayName: user.displayName,
        handle: user.handle,
        createdAt: user.createdAt,
        marketingOptIn: toBooleanStrict(user.marketingOptIn),
        marketingOptInAt: user.marketingOptInAt
      }
    : {
        id: user.id,
        email: user.email,
        password: '__remote_account__',
        displayName: user.displayName,
        handle: user.handle,
        createdAt: user.createdAt,
        marketingOptIn: toBooleanStrict(user.marketingOptIn),
        marketingOptInAt: user.marketingOptInAt
      };
  const nextUsers = existing
    ? users.map((item) => (item.id === user.id ? nextRecord : item))
    : [nextRecord, ...users];
  writeJson(USERS_KEY, nextUsers);
}

function createHandleFromEmail(email: string): string {
  const prefix = email.split('@')[0] || `user${Date.now().toString().slice(-5)}`;
  return normalizeHandle(prefix) || `user${Date.now().toString().slice(-5)}`;
}

function createHandleFromDisplayName(displayName: string, fallbackEmail?: string): string {
  const fromName = normalizeHandle(displayName);
  if (fromName) return fromName;
  if (fallbackEmail) return createHandleFromEmail(fallbackEmail);
  return `user${Date.now().toString().slice(-5)}`;
}

function toPublicUserFromRemote(input: {
  id: string;
  email: string;
  createdAt?: string;
  userMetadata?: Record<string, unknown>;
}): AuthSessionUser {
  const metadata = input.userMetadata ?? {};
  const displayNameRaw =
    typeof metadata.display_name === 'string'
      ? metadata.display_name
      : typeof metadata.full_name === 'string'
        ? metadata.full_name
        : typeof metadata.name === 'string'
          ? metadata.name
          : typeof metadata.user_name === 'string'
            ? metadata.user_name
            : '';
  const handleRaw = typeof metadata.handle === 'string' ? metadata.handle : '';
  const avatarRaw = typeof metadata.avatar_data_url === 'string' ? metadata.avatar_data_url : '';
  const marketingOptInRaw = metadata.marketing_opt_in;
  const marketingOptInAtRaw = metadata.marketing_opt_in_at;
  const displayName = displayNameRaw.trim() || input.email.split('@')[0] || 'Utilisateur NIVELR';
  const handle = normalizeHandle(handleRaw) || createHandleFromDisplayName(displayName, input.email);
  return {
    id: input.id,
    email: input.email,
    displayName,
    handle,
    createdAt: input.createdAt ?? new Date().toISOString(),
    avatarDataUrl: getAvatarForUser(input.id) ?? avatarRaw ?? undefined,
    marketingOptIn: toBooleanStrict(marketingOptInRaw),
    marketingOptInAt: typeof marketingOptInAtRaw === 'string' ? marketingOptInAtRaw : undefined
  };
}

async function syncPublicProfileRemote(user: AuthSessionUser): Promise<void> {
  if (!REMOTE_AUTH_ENABLED || !supabase) return;
  const payload = {
    user_id: user.id,
    display_name: user.displayName,
    handle: normalizeHandle(user.handle) || createHandleFromDisplayName(user.displayName, user.email),
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('user_public_profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    console.warn('user_public_profiles upsert error', error.message);
  }
}

async function persistRemoteSession(): Promise<AuthSessionUser | null> {
  if (!REMOTE_AUTH_ENABLED || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return persistRemoteSessionFromData(data.session);
}

function persistRemoteSessionFromData(remoteSession: { user?: { id?: string; email?: string; created_at?: string; user_metadata?: Record<string, unknown> } } | null): AuthSessionUser | null {
  const session = remoteSession;
  if (!session?.user?.email || !session.user.id) {
    localStorage.removeItem(SESSION_KEY);
    emitAuthChanged();
    return null;
  }

  const publicUser = toPublicUserFromRemote({
    id: session.user.id,
    email: session.user.email,
    createdAt: session.user.created_at,
    userMetadata: session.user.user_metadata
  });
  upsertLocalMirrorFromPublicUser(publicUser);
  writeJson(SESSION_KEY, publicUser);
  void syncPublicProfileRemote(publicUser);
  emitAuthChanged();
  return publicUser;
}

function isFakeUserRecord(user: Pick<StoredUser, 'id' | 'email'>): boolean {
  return user.id.startsWith(FAKE_USER_ID_PREFIX) || user.email.endsWith(FAKE_USER_EMAIL_DOMAIN);
}

export function isFakeCommunityUser(user: AuthSessionUser): boolean {
  return isFakeUserRecord(user);
}

export function listLocalUsers(): AuthSessionUser[] {
  const users = sanitizeStoredUsersConsent(readJson<StoredUser[]>(USERS_KEY, []));
  return users.map(toPublicUser);
}

export function listFakeUsersLocal(): AuthSessionUser[] {
  const users = sanitizeStoredUsersConsent(readJson<StoredUser[]>(USERS_KEY, []));
  return users
    .filter((user) => isFakeUserRecord(user))
    .map(toPublicUser);
}

export function getCurrentSessionUser(): AuthSessionUser | null {
  return readJson<AuthSessionUser | null>(SESSION_KEY, null);
}

export async function initAuthProviderSession(): Promise<AuthSessionUser | null> {
  if (!REMOTE_AUTH_ENABLED || !supabase) {
    return getCurrentSessionUser();
  }
  const first = await persistRemoteSession();
  if (first) return first;
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  return persistRemoteSession();
}

export function subscribeRemoteAuthState(onChange: () => void): () => void {
  if (!REMOTE_AUTH_ENABLED || !supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    persistRemoteSessionFromData(
      session
        ? {
            user: {
              id: session.user?.id,
              email: session.user?.email,
              created_at: session.user?.created_at,
              user_metadata: session.user?.user_metadata as Record<string, unknown> | undefined
            }
          }
        : null
    );
    onChange();
    void persistRemoteSession().then(() => {
      onChange();
    });
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export function signOutLocal(): void {
  if (REMOTE_AUTH_ENABLED && supabase) {
    void supabase.auth.signOut();
  }
  localStorage.removeItem(MODO_KEY);
  localStorage.removeItem(SESSION_KEY);
  emitAuthChanged();
}

function deleteLocalUserData(userId: string): void {
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  writeJson(
    USERS_KEY,
    users.filter((user) => user.id !== userId)
  );

  const contacts = readJson<ContactRequest[]>(CONTACTS_KEY, []);
  writeJson(
    CONTACTS_KEY,
    contacts.filter((item) => item.requesterUserId !== userId && item.targetUserId !== userId)
  );

  const teamInvites = readJson<TeamInvite[]>(TEAM_INVITES_KEY, []);
  writeJson(
    TEAM_INVITES_KEY,
    teamInvites.filter((item) => item.inviterUserId !== userId && item.invitedUserId !== userId)
  );

  const subscriptions = readSubscriptions();
  if (subscriptions[userId]) {
    const nextSubscriptions = { ...subscriptions };
    delete nextSubscriptions[userId];
    writeSubscriptions(nextSubscriptions);
  }

  setAvatarForUser(userId, null);
}

export async function deleteCurrentAccountLocal(input: {
  reasonCategory: string;
  reasonDetail: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = getCurrentSessionUser();
  if (!session) return { ok: false, error: 'Session introuvable.' };

  if (REMOTE_AUTH_ENABLED && supabase) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token?.trim() ?? '';
    if (!accessToken) {
      return { ok: false, error: 'Session expirée. Reconnecte-toi puis réessaie.' };
    }

    const invoke = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('delete-user-account', {
      body: {
        reasonCategory: input.reasonCategory.trim(),
        reasonDetail: input.reasonDetail.trim()
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (invoke.error || !invoke.data?.ok) {
      return {
        ok: false,
        error:
          invoke.data?.error ??
          invoke.error?.message ??
          "Suppression impossible pour l'instant. Réessaie dans quelques instants."
      };
    }
  }

  deleteLocalUserData(session.id);
  signOutLocal();
  return { ok: true };
}

export async function signInLocal(
  email: string,
  password: string
): Promise<{ user: AuthSessionUser | null; error?: string }> {
  const signInGuardError = checkAuthGuard('signin');
  if (signInGuardError) return { user: null, error: signInGuardError };

  if (REMOTE_AUTH_ENABLED && supabase) {
    const normalizedEmail = normalizeEmailForAuth(email);
    const nextPassword = password.trim();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: nextPassword
    });
    if (error || !data.user?.email) {
      markSignInFailureGuard();
      return {
        user: null,
        error:
          "Identifiants invalides. Si ce compte a été créé avec Google, utilise 'Continuer avec Google'."
      };
    }
    const publicUser = toPublicUserFromRemote({
      id: data.user.id,
      email: data.user.email,
      createdAt: data.user.created_at,
      userMetadata: data.user.user_metadata
    });
    writeJson(SESSION_KEY, publicUser);
    void syncPublicProfileRemote(publicUser);
    markSignInSuccessGuard();
    emitAuthChanged();
    return { user: publicUser };
  }

  const users = sanitizeStoredUsersConsent(readJson<StoredUser[]>(USERS_KEY, []));
  const normalizedEmail = normalizeEmailForAuth(email);
  const rawPassword = password;
  const trimmedPassword = password.trim();
  const user = users.find(
    (item) =>
      normalizeEmailForAuth(item.email) === normalizedEmail &&
      (item.password === rawPassword || item.password === trimmedPassword)
  );
  if (!user) {
    markSignInFailureGuard();
    return { user: null, error: 'Identifiants invalides.' };
  }
  const publicUser = toPublicUser(user);
  writeJson(SESSION_KEY, publicUser);
  markSignInSuccessGuard();
  emitAuthChanged();
  return { user: publicUser };
}

export async function signInWithOAuthLocal(
  provider: 'google' | 'facebook'
): Promise<{ ok: boolean; error?: string }> {
  if (!REMOTE_AUTH_ENABLED || !supabase) {
    return { ok: false, error: 'Connexion sociale indisponible en mode local.' };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/connexion`
    }
  });
  if (error) {
    return { ok: false, error: 'Provider non activé côté Supabase.' };
  }
  return { ok: true };
}

export async function signUpLocal(input: {
  email: string;
  password: string;
  displayName: string;
  marketingOptIn?: boolean;
}): Promise<{ user: AuthSessionUser | null; error?: string }> {
  const signUpGuardError = checkAuthGuard('signup');
  if (signUpGuardError) return { user: null, error: signUpGuardError };

  if (REMOTE_AUTH_ENABLED && supabase) {
    const email = normalizeEmailForAuth(input.email);
    const password = input.password.trim();
    if (!isValidEmail(email)) return { user: null, error: 'Email invalide.' };
    if (password.length < 6) return { user: null, error: 'Mot de passe trop court (min 6).' };
    const displayNameError = validateDisplayName(input.displayName);
    if (displayNameError) return { user: null, error: displayNameError };
    const metadata = {
      display_name: input.displayName.trim() || 'Utilisateur NIVELR',
      handle: createHandleFromDisplayName(input.displayName.trim(), email),
      marketing_opt_in: Boolean(input.marketingOptIn),
      marketing_opt_in_at: input.marketingOptIn ? new Date().toISOString() : undefined
    };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
    if (error) {
      markSignUpAttemptGuard(false);
      if (error.message.toLowerCase().includes('already registered')) {
        return {
          user: null,
          error:
            "Email déjà utilisé. Si tu t'es inscrit avec Google, reconnecte-toi via 'Continuer avec Google'."
        };
      }
      return { user: null, error: 'Inscription impossible. Réessaie.' };
    }
    if (!data.user?.email) {
      markSignUpAttemptGuard(false);
      return { user: null, error: 'Inscription créée. Vérifie ton email de confirmation.' };
    }
    const publicUser = toPublicUserFromRemote({
      id: data.user.id,
      email: data.user.email,
      createdAt: data.user.created_at,
      userMetadata: data.user.user_metadata
    });
    writeJson(SESSION_KEY, publicUser);
    void syncPublicProfileRemote(publicUser);
    markSignUpAttemptGuard(true);
    emitAuthChanged();
    return { user: publicUser };
  }

  const users = sanitizeStoredUsersConsent(readJson<StoredUser[]>(USERS_KEY, []));
  const email = normalizeEmailForAuth(input.email);
  const password = input.password.trim();
  if (!isValidEmail(email)) return { user: null, error: 'Email invalide.' };
  if (password.length < 6) return { user: null, error: 'Mot de passe trop court (min 6).' };
  if (users.some((item) => normalizeEmailForAuth(item.email) === email)) {
    return { user: null, error: 'Email déjà utilisé.' };
  }
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
    password,
    displayName: input.displayName.trim() || 'Utilisateur NIVELR',
    handle,
    createdAt: new Date().toISOString(),
    marketingOptIn: Boolean(input.marketingOptIn),
    marketingOptInAt: input.marketingOptIn ? new Date().toISOString() : undefined
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
  markSignUpAttemptGuard(true);
  emitAuthChanged();
  return { user: publicUser };
}

export async function updateProfileLocal(userId: string, patch: { displayName: string }): Promise<{
  user: AuthSessionUser | null;
  error?: string;
}> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const nextDisplayName = patch.displayName.trim();
    if (!nextDisplayName) return { user: null, error: 'Nom affiché invalide.' };
    const displayNameError = validateDisplayName(nextDisplayName);
    if (displayNameError) return { user: null, error: displayNameError };
    const session = getCurrentSessionUser();
    if (!session || session.id !== userId) {
      return { user: null, error: 'Session invalide.' };
    }
    const { data, error } = await supabase.auth.updateUser({
      data: {
        display_name: nextDisplayName,
        handle: createHandleFromDisplayName(nextDisplayName, session.email)
      }
    });
    if (error || !data.user?.email) return { user: null, error: 'Mise à jour impossible.' };
    const publicUser = toPublicUserFromRemote({
      id: data.user.id,
      email: data.user.email,
      createdAt: data.user.created_at,
      userMetadata: data.user.user_metadata
    });
    writeJson(SESSION_KEY, publicUser);
    void syncPublicProfileRemote(publicUser);
    emitAuthChanged();
    return { user: publicUser };
  }

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

export async function updateProfileAvatarLocal(
  userId: string,
  avatarDataUrl: string | null
): Promise<{
  user: AuthSessionUser | null;
  error?: string;
}> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const session = getCurrentSessionUser();
    if (!session || session.id !== userId) {
      return { user: null, error: 'Session invalide.' };
    }
    setAvatarForUser(userId, avatarDataUrl);
    const publicUser: AuthSessionUser = {
      ...session,
      avatarDataUrl: avatarDataUrl ?? undefined
    };
    writeJson(SESSION_KEY, publicUser);
    emitAuthChanged();
    return { user: publicUser };
  }

  const users = readJson<StoredUser[]>(USERS_KEY, []);
  let updated: StoredUser | null = null;
  const nextUsers = users.map((item) => {
    if (item.id !== userId) return item;
    updated = {
      ...item,
      avatarDataUrl: avatarDataUrl ?? undefined
    };
    return updated;
  });
  writeJson(USERS_KEY, nextUsers);
  setAvatarForUser(userId, avatarDataUrl);
  if (!updated) return { user: null, error: 'Utilisateur introuvable.' };
  const publicUser = toPublicUser(updated);
  writeJson(SESSION_KEY, publicUser);
  emitAuthChanged();
  return { user: publicUser };
}

export function getUserContactPreferencesLocal(userId: string): UserContactPreferences {
  const session = getCurrentSessionUser();
  if (session && session.id === userId) {
    return {
      marketingOptIn: toBooleanStrict(session.marketingOptIn),
      marketingOptInAt: session.marketingOptInAt
    };
  }
  const users = sanitizeStoredUsersConsent(readJson<StoredUser[]>(USERS_KEY, []));
  const user = users.find((item) => item.id === userId);
  if (!user) {
    return { marketingOptIn: false };
  }
  return {
    marketingOptIn: toBooleanStrict(user.marketingOptIn),
    marketingOptInAt: user.marketingOptInAt
  };
}

export async function updateUserContactPreferencesLocal(
  userId: string,
  input: UserContactPreferences
): Promise<{ user: AuthSessionUser | null; error?: string }> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const session = getCurrentSessionUser();
    if (!session || session.id !== userId) {
      return { user: null, error: 'Session invalide.' };
    }
    const nextOptIn = Boolean(input.marketingOptIn);
    const nextOptInAt = nextOptIn
      ? session.marketingOptInAt ?? new Date().toISOString()
      : undefined;
    const { data, error } = await supabase.auth.updateUser({
      data: {
        marketing_opt_in: nextOptIn,
        marketing_opt_in_at: nextOptInAt ?? null
      }
    });
    if (error || !data.user?.email) return { user: null, error: 'Mise à jour impossible.' };
    const publicUser = toPublicUserFromRemote({
      id: data.user.id,
      email: data.user.email,
      createdAt: data.user.created_at,
      userMetadata: data.user.user_metadata
    });
    upsertLocalMirrorFromPublicUser(publicUser);
    writeJson(SESSION_KEY, publicUser);
    emitAuthChanged();
    return { user: publicUser };
  }

  const users = sanitizeStoredUsersConsent(readJson<StoredUser[]>(USERS_KEY, []));
  const current = users.find((item) => item.id === userId);
  if (!current) {
    return { user: null, error: 'Utilisateur introuvable.' };
  }

  const nextOptIn = Boolean(input.marketingOptIn);
  const nowIso = new Date().toISOString();
  let updated: StoredUser | null = null;
  const nextUsers = users.map((item) => {
    if (item.id !== userId) return item;
    const previousOptIn = Boolean(item.marketingOptIn);
    updated = {
      ...item,
      marketingOptIn: nextOptIn,
      marketingOptInAt: nextOptIn ? (previousOptIn ? item.marketingOptInAt : nowIso) : undefined
    };
    return updated;
  });

  writeJson(USERS_KEY, nextUsers);
  if (!updated) {
    return { user: null, error: 'Mise à jour impossible.' };
  }

  const session = getCurrentSessionUser();
  if (session?.id === userId) {
    writeJson(SESSION_KEY, toPublicUser(updated));
  }
  emitAuthChanged();
  return { user: toPublicUser(updated) };
}

export function listMarketingContactsLocal(): MarketingContactEntry[] {
  if (!isModoEnabledLocal()) return [];
  const users = sanitizeStoredUsersConsent(readJson<StoredUser[]>(USERS_KEY, []));
  const byEmail = new Map<string, StoredUser>();

  for (const user of users) {
    const emailKey = user.email.trim().toLowerCase();
    if (!emailKey || isInternalEmail(emailKey)) continue;
    const existing = byEmail.get(emailKey);
    if (!existing) {
      byEmail.set(emailKey, user);
      continue;
    }
    const existingUuid = isUuidLikeId(existing.id);
    const currentUuid = isUuidLikeId(user.id);
    if (!existingUuid && currentUuid) {
      byEmail.set(emailKey, user);
      continue;
    }
    if (existingUuid && !currentUuid) {
      continue;
    }
    const existingTs = new Date(existing.createdAt).getTime();
    const currentTs = new Date(user.createdAt).getTime();
    if (Number.isFinite(currentTs) && currentTs >= existingTs) {
      byEmail.set(emailKey, user);
    }
  }

  return Array.from(byEmail.values())
    .map((user) => ({
      id: user.id,
      displayName: user.displayName,
      handle: user.handle,
      email: user.email,
      marketingOptIn: toBooleanStrict(user.marketingOptIn),
      marketingOptInAt: user.marketingOptInAt
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr-FR'));
}

export function createFakeUsersLocal(count = 10): { ok: boolean; created: number; error?: string } {
  if (!isModoEnabledLocal()) {
    return { ok: false, created: 0, error: 'Mode modérateur requis.' };
  }
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const subscriptions = readSubscriptions();
  const fakeNames = [
    'Alex Sprint',
    'Maya Trail',
    'Noah Tempo',
    'Lina Summit',
    'Hugo Long Run',
    'Emma Cardio',
    'Leo Pace',
    'Nina Endurance',
    'Tom Relay',
    'Sara Fartlek',
    'Paul Horizon',
    'Ines Stride'
  ];

  let created = 0;
  const nextUsers = [...users];
  const targetCount = Math.max(1, Math.min(40, Math.floor(count)));

  for (let i = 0; i < targetCount; i += 1) {
    const baseName = fakeNames[i % fakeNames.length];
    let displayName = baseName;
    let suffix = 1;
    while (
      nextUsers.some(
        (user) =>
          normalizeDisplayNameForCompare(user.displayName) === normalizeDisplayNameForCompare(displayName)
      )
    ) {
      suffix += 1;
      displayName = `${baseName} ${suffix}`;
    }

    const handle = generateUniqueHandle(displayName, nextUsers);
    const fakeUser: StoredUser = {
      id: `${FAKE_USER_ID_PREFIX}${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`,
      email: `${handle}.${i + 1}${FAKE_USER_EMAIL_DOMAIN}`,
      password: 'test1234',
      displayName,
      handle,
      createdAt: new Date().toISOString()
    };
    nextUsers.unshift(fakeUser);
    subscriptions[fakeUser.id] = subscriptions[fakeUser.id] ?? getDefaultSubscription();
    created += 1;
  }

  writeJson(USERS_KEY, nextUsers);
  writeSubscriptions(subscriptions);
  emitAuthChanged();
  return { ok: true, created };
}

export function purgeFakeUsersLocal(): { ok: boolean; removed: number; error?: string } {
  if (!isModoEnabledLocal()) {
    return { ok: false, removed: 0, error: 'Mode modérateur requis.' };
  }
  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const fakeIds = new Set(users.filter((user) => isFakeUserRecord(user)).map((user) => user.id));
  if (!fakeIds.size) return { ok: true, removed: 0 };

  const keptUsers = users.filter((user) => !fakeIds.has(user.id));
  writeJson(USERS_KEY, keptUsers);

  const contacts = readJson<ContactRequest[]>(CONTACTS_KEY, []);
  const keptContacts = contacts.filter(
    (item) => !fakeIds.has(item.requesterUserId) && !fakeIds.has(item.targetUserId)
  );
  writeJson(CONTACTS_KEY, keptContacts);

  const teamInvites = readJson<TeamInvite[]>(TEAM_INVITES_KEY, []);
  const keptTeamInvites = teamInvites.filter(
    (item) => !fakeIds.has(item.inviterUserId) && !fakeIds.has(item.invitedUserId)
  );
  writeJson(TEAM_INVITES_KEY, keptTeamInvites);

  const subscriptions = readSubscriptions();
  const nextSubscriptions = { ...subscriptions };
  for (const fakeId of fakeIds) {
    delete nextSubscriptions[fakeId];
  }
  writeSubscriptions(nextSubscriptions);

  const session = getCurrentSessionUser();
  if (session && fakeIds.has(session.id)) {
    signOutLocal();
  } else {
    emitAuthChanged();
  }
  return { ok: true, removed: fakeIds.size };
}

export async function updateAccountSecurityLocal(input: {
  userId: string;
  currentPassword: string;
  nextEmail?: string;
  nextPassword?: string;
}): Promise<{
  user: AuthSessionUser | null;
  error?: string;
  emailChanged?: boolean;
  passwordChanged?: boolean;
}> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const session = getCurrentSessionUser();
    if (!session || session.id !== input.userId) {
      return { user: null, error: 'Session invalide.' };
    }

    const trimmedEmail = input.nextEmail ? normalizeEmailForAuth(input.nextEmail) : session.email;
    const trimmedPassword = input.nextPassword?.trim() ?? '';
    const wantsEmailChange = normalizeEmailForAuth(trimmedEmail) !== normalizeEmailForAuth(session.email);
    const wantsPasswordChange = Boolean(trimmedPassword);
    if (!wantsEmailChange && !wantsPasswordChange) {
      return { user: null, error: 'Aucune modification détectée.' };
    }
    if (wantsEmailChange && !isValidEmail(trimmedEmail)) {
      return { user: null, error: 'Nouvel email invalide.' };
    }
    if (wantsPasswordChange && trimmedPassword.length < 6) {
      return { user: null, error: 'Nouveau mot de passe trop court (min 6).' };
    }

    if (wantsEmailChange) {
      const { error } = await supabase.auth.updateUser({ email: trimmedEmail });
      if (error) return { user: null, error: 'Changement email impossible.' };
    }
    if (wantsPasswordChange) {
      const { error } = await supabase.auth.updateUser({ password: trimmedPassword });
      if (error) return { user: null, error: 'Changement mot de passe impossible.' };
    }
    const refreshed = await persistRemoteSession();
    return {
      user: refreshed,
      emailChanged: wantsEmailChange,
      passwordChanged: wantsPasswordChange
    };
  }

  const users = readJson<StoredUser[]>(USERS_KEY, []);
  const user = users.find((item) => item.id === input.userId);
  if (!user) return { user: null, error: 'Utilisateur introuvable.' };
  if (user.password !== input.currentPassword) {
    return { user: null, error: 'Mot de passe actuel incorrect.' };
  }

  const trimmedEmail = input.nextEmail ? normalizeEmailForAuth(input.nextEmail) : user.email;
  const trimmedPassword = input.nextPassword?.trim() ?? '';
  const wantsEmailChange = normalizeEmailForAuth(trimmedEmail) !== normalizeEmailForAuth(user.email);
  const wantsPasswordChange = Boolean(trimmedPassword);

  if (!wantsEmailChange && !wantsPasswordChange) {
    return { user: null, error: 'Aucune modification détectée.' };
  }

  if (wantsEmailChange) {
    if (!isValidEmail(trimmedEmail)) return { user: null, error: 'Nouvel email invalide.' };
    if (
      users.some(
        (item) => item.id !== user.id && normalizeEmailForAuth(item.email) === normalizeEmailForAuth(trimmedEmail)
      )
    ) {
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

export function searchUsersLocal(
  query: string,
  currentUserId?: string,
  options?: { includeFakeUsers?: boolean }
): AuthSessionUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const includeFakeUsers = options?.includeFakeUsers ?? false;
  return listLocalUsers()
    .filter((user) => user.id !== currentUserId)
    .filter((user) => (includeFakeUsers ? true : !isFakeCommunityUser(user)))
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

export function addFriendDirectLocal(requesterUserId: string, targetUserId: string): {
  ok: boolean;
  error?: string;
} {
  if (!isModoEnabledLocal()) {
    return { ok: false, error: 'Mode modérateur requis.' };
  }
  if (!requesterUserId || !targetUserId || requesterUserId === targetUserId) {
    return { ok: false, error: 'Ajout ami invalide.' };
  }
  const all = listContactsInternal();
  const existing = all.find(
    (item) =>
      (item.requesterUserId === requesterUserId && item.targetUserId === targetUserId) ||
      (item.requesterUserId === targetUserId && item.targetUserId === requesterUserId)
  );
  if (existing) {
    if (existing.status === 'ACCEPTED') return { ok: true };
    const now = new Date().toISOString();
    const next = all.map((item) =>
      item.id === existing.id
        ? {
            ...item,
            status: 'ACCEPTED' as const,
            updatedAt: now
          }
        : item
    );
    saveContactsInternal(next);
    return { ok: true };
  }

  const now = new Date().toISOString();
  const next: ContactRequest[] = [
    {
      id: `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      requesterUserId,
      targetUserId,
      status: 'ACCEPTED',
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

export function cancelOutgoingContactRequestLocal(
  requestId: string,
  requesterUserId: string
): { ok: boolean; error?: string } {
  const all = listContactsInternal();
  const target = all.find((item) => item.id === requestId);
  if (!target) return { ok: false, error: 'Demande introuvable.' };
  if (target.requesterUserId !== requesterUserId) {
    return { ok: false, error: 'Action non autorisée.' };
  }
  if (target.status !== 'PENDING') {
    return { ok: false, error: 'Seules les demandes en attente peuvent être annulées.' };
  }
  const next = all.filter((item) => item.id !== requestId);
  saveContactsInternal(next);
  return { ok: true };
}

export function removeFriendLocal(userId: string, friendUserId: string): { ok: boolean; error?: string } {
  if (!userId || !friendUserId || userId === friendUserId) {
    return { ok: false, error: 'Suppression invalide.' };
  }
  const all = listContactsInternal();
  const existingAccepted = all.filter(
    (item) =>
      item.status === 'ACCEPTED' &&
      ((item.requesterUserId === userId && item.targetUserId === friendUserId) ||
        (item.requesterUserId === friendUserId && item.targetUserId === userId))
  );
  if (!existingAccepted.length) {
    return { ok: false, error: 'Ami introuvable.' };
  }
  const acceptedIds = new Set(existingAccepted.map((item) => item.id));
  const next = all.filter((item) => !acceptedIds.has(item.id));
  saveContactsInternal(next);
  return { ok: true };
}

function toPublicUserFromProgressRow(row: Record<string, unknown>): AuthSessionUser | null {
  const userId = typeof row.user_id === 'string' ? row.user_id : '';
  const displayName = typeof row.display_name === 'string' ? row.display_name : '';
  const handleRaw = typeof row.handle === 'string' ? row.handle : '';
  const handle = normalizeHandle(handleRaw);
  if (!userId || !handle) return null;
  return {
    id: userId,
    email: `${handle}@users.nivelr.local`,
    displayName: displayName.trim() || handle,
    handle,
    createdAt: new Date().toISOString()
  };
}

export async function listUsersSocial(options?: { includeFakeUsers?: boolean }): Promise<AuthSessionUser[]> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const { data, error } = await supabase
      .from('user_public_profiles')
      .select('user_id,display_name,handle')
      .order('display_name', { ascending: true })
      .limit(500);
    if (error || !Array.isArray(data)) return [];
    const remoteUsers = (data as Array<Record<string, unknown>>)
      .map((row) => toPublicUserFromProgressRow(row))
      .filter((item): item is AuthSessionUser => Boolean(item));
    if (options?.includeFakeUsers) {
      return [...remoteUsers, ...listFakeUsersLocal()];
    }
    return remoteUsers;
  }
  return listLocalUsers();
}

export async function searchUsersSocial(
  query: string,
  currentUserId?: string,
  options?: { includeFakeUsers?: boolean }
): Promise<AuthSessionUser[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  if (REMOTE_AUTH_ENABLED && supabase) {
    const safeQuery = q.replace(/[%]/g, '').replace(/,/g, '');
    const { data, error } = await supabase
      .from('user_public_profiles')
      .select('user_id,display_name,handle')
      .or(`display_name.ilike.%${safeQuery}%,handle.ilike.%${safeQuery}%`)
      .limit(20);

    const remoteUsers =
      error || !Array.isArray(data)
        ? []
        : (data as Array<Record<string, unknown>>)
            .map((row) => toPublicUserFromProgressRow(row))
            .filter((item): item is AuthSessionUser => Boolean(item))
            .filter((user) => user.id !== currentUserId);

    if (options?.includeFakeUsers) {
      const fake = listFakeUsersLocal().filter(
        (user) =>
          user.displayName.toLowerCase().includes(q) ||
          user.handle.toLowerCase().includes(q) ||
          user.email.toLowerCase().includes(q)
      );
      return [...remoteUsers, ...fake].slice(0, 20);
    }
    return remoteUsers;
  }

  return searchUsersLocal(query, currentUserId, options);
}

export async function listContactRequestsForUserAsync(userId: string): Promise<{
  incoming: ContactRequest[];
  outgoing: ContactRequest[];
}> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const [incomingResponse, outgoingResponse] = await Promise.all([
      supabase
        .from('user_contacts')
        .select('id,requester_user_id,target_user_id,status,created_at,updated_at')
        .eq('target_user_id', userId),
      supabase
        .from('user_contacts')
        .select('id,requester_user_id,target_user_id,status,created_at,updated_at')
        .eq('requester_user_id', userId)
    ]);
    const mapRow = (row: Record<string, unknown>): ContactRequest | null => {
      const id = typeof row.id === 'string' ? row.id : '';
      const requester = typeof row.requester_user_id === 'string' ? row.requester_user_id : '';
      const target = typeof row.target_user_id === 'string' ? row.target_user_id : '';
      const status = row.status;
      const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
      const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt;
      if (!id || !requester || !target) return null;
      if (status !== 'PENDING' && status !== 'ACCEPTED' && status !== 'DECLINED') return null;
      return {
        id,
        requesterUserId: requester,
        targetUserId: target,
        status,
        createdAt,
        updatedAt
      };
    };
    return {
      incoming:
        incomingResponse.error || !Array.isArray(incomingResponse.data)
          ? []
          : incomingResponse.data
              .map((row) => mapRow(row as Record<string, unknown>))
              .filter((item): item is ContactRequest => Boolean(item)),
      outgoing:
        outgoingResponse.error || !Array.isArray(outgoingResponse.data)
          ? []
          : outgoingResponse.data
              .map((row) => mapRow(row as Record<string, unknown>))
              .filter((item): item is ContactRequest => Boolean(item))
    };
  }
  return listContactRequestsForUser(userId);
}

export async function sendContactRequest(requesterUserId: string, targetUserId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    if (!requesterUserId || !targetUserId || requesterUserId === targetUserId) {
      return { ok: false, error: 'Demande invalide.' };
    }
    const { data: existing, error: existingError } = await supabase
      .from('user_contacts')
      .select('id')
      .or(
        `and(requester_user_id.eq.${requesterUserId},target_user_id.eq.${targetUserId}),and(requester_user_id.eq.${targetUserId},target_user_id.eq.${requesterUserId})`
      )
      .limit(1);
    if (existingError) return { ok: false, error: existingError.message };
    if (Array.isArray(existing) && existing.length > 0) {
      return { ok: false, error: 'Demande déjà existante.' };
    }
    const { error } = await supabase.from('user_contacts').insert({
      requester_user_id: requesterUserId,
      target_user_id: targetUserId,
      status: 'PENDING'
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  return sendContactRequestLocal(requesterUserId, targetUserId);
}

export async function addFriendDirect(
  requesterUserId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    if (!isModoEnabledLocal()) return { ok: false, error: 'Mode modérateur requis.' };
    const now = new Date().toISOString();
    const { data: existing, error: existingError } = await supabase
      .from('user_contacts')
      .select('id')
      .or(
        `and(requester_user_id.eq.${requesterUserId},target_user_id.eq.${targetUserId}),and(requester_user_id.eq.${targetUserId},target_user_id.eq.${requesterUserId})`
      )
      .limit(1);
    if (existingError) return { ok: false, error: existingError.message };
    if (Array.isArray(existing) && existing[0]?.id) {
      const { error } = await supabase
        .from('user_contacts')
        .update({ status: 'ACCEPTED', updated_at: now })
        .eq('id', existing[0].id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    const { error } = await supabase.from('user_contacts').insert({
      requester_user_id: requesterUserId,
      target_user_id: targetUserId,
      status: 'ACCEPTED'
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  return addFriendDirectLocal(requesterUserId, targetUserId);
}

export async function respondToContactRequest(
  requestId: string,
  targetUserId: string,
  decision: 'ACCEPTED' | 'DECLINED'
): Promise<{ ok: boolean; error?: string }> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const { error } = await supabase
      .from('user_contacts')
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('target_user_id', targetUserId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  return respondToContactRequestLocal(requestId, targetUserId, decision);
}

export async function cancelOutgoingContactRequest(
  requestId: string,
  requesterUserId: string
): Promise<{ ok: boolean; error?: string }> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const { error } = await supabase
      .from('user_contacts')
      .delete()
      .eq('id', requestId)
      .eq('requester_user_id', requesterUserId)
      .eq('status', 'PENDING');
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  return cancelOutgoingContactRequestLocal(requestId, requesterUserId);
}

export async function removeFriend(
  userId: string,
  friendUserId: string
): Promise<{ ok: boolean; error?: string }> {
  if (REMOTE_AUTH_ENABLED && supabase) {
    const { error } = await supabase
      .from('user_contacts')
      .delete()
      .or(
        `and(requester_user_id.eq.${userId},target_user_id.eq.${friendUserId},status.eq.ACCEPTED),and(requester_user_id.eq.${friendUserId},target_user_id.eq.${userId},status.eq.ACCEPTED)`
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  return removeFriendLocal(userId, friendUserId);
}

function listTeamInvitesInternal(): TeamInvite[] {
  return readJson<TeamInvite[]>(TEAM_INVITES_KEY, []);
}

function saveTeamInvitesInternal(next: TeamInvite[]): void {
  writeJson(TEAM_INVITES_KEY, next);
}

export function listTeamInvitesForUser(userId: string): {
  incoming: TeamInvite[];
  outgoing: TeamInvite[];
} {
  const all = listTeamInvitesInternal();
  return {
    incoming: all.filter((item) => item.invitedUserId === userId),
    outgoing: all.filter((item) => item.inviterUserId === userId)
  };
}

export function sendTeamInviteLocal(input: {
  seasonId: string;
  teamId: string;
  teamName: string;
  inviteCode: string;
  inviterUserId: string;
  invitedUserId: string;
}): { ok: boolean; error?: string } {
  if (!input.inviterUserId || !input.invitedUserId || input.inviterUserId === input.invitedUserId) {
    return { ok: false, error: 'Invitation invalide.' };
  }
  const all = listTeamInvitesInternal();
  const hasPending = all.some(
    (item) =>
      item.seasonId === input.seasonId &&
      item.teamId === input.teamId &&
      item.inviterUserId === input.inviterUserId &&
      item.invitedUserId === input.invitedUserId &&
      item.status === 'PENDING'
  );
  if (hasPending) return { ok: false, error: 'Invitation déjà envoyée.' };
  const now = new Date().toISOString();
  const next: TeamInvite[] = [
    {
      id: `ti_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      seasonId: input.seasonId,
      teamId: input.teamId,
      teamName: input.teamName,
      inviteCode: input.inviteCode,
      inviterUserId: input.inviterUserId,
      invitedUserId: input.invitedUserId,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now
    },
    ...all
  ];
  saveTeamInvitesInternal(next);
  return { ok: true };
}

export function respondTeamInviteLocal(
  inviteId: string,
  invitedUserId: string,
  decision: 'ACCEPTED' | 'DECLINED'
): { ok: boolean; error?: string } {
  const all = listTeamInvitesInternal();
  let changed = false;
  const next = all.map((item) => {
    if (item.id !== inviteId) return item;
    if (item.invitedUserId !== invitedUserId) return item;
    changed = true;
    return {
      ...item,
      status: decision,
      updatedAt: new Date().toISOString()
    };
  });
  if (!changed) return { ok: false, error: 'Invitation introuvable.' };
  saveTeamInvitesInternal(next);
  return { ok: true };
}

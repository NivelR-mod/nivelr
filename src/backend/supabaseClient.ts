import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_AUTH_READY = Boolean(url && anonKey);

export const supabase = SUPABASE_AUTH_READY
  ? createClient(url, anonKey, {
      auth: {
        // Evite les timeouts LockManager en contexte mobile/PWA.
        lock: async (_name, _acquireTimeout, fn) => await fn()
      }
    })
  : null;

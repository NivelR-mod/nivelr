export const BACKEND_FLAGS = {
  backendEnabled: (import.meta.env.VITE_BACKEND_ENABLED ?? 'false') === 'true',
  authEnabled: (import.meta.env.VITE_AUTH_ENABLED ?? 'false') === 'true',
  subscriptionEnabled: (import.meta.env.VITE_SUBSCRIPTION_ENABLED ?? 'false') === 'true',
  socialEnabled: (import.meta.env.VITE_SOCIAL_ENABLED ?? 'false') === 'true'
} as const;

export const BACKEND_PROVIDER = import.meta.env.VITE_BACKEND_PROVIDER ?? 'LOCAL_SAFE';

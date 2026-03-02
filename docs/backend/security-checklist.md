# NIVELR - Checklist securite (production)

## 1) Supabase Auth (obligatoire)
- Email provider active.
- Confirm email active (recommande).
- Leaked password protection active.
- URL autorisees strictes:
  - `https://nivelr.vercel.app`
  - `https://nivelr.vercel.app/connexion`
  - `http://localhost:5173` (dev uniquement)
- Desactiver les providers non utilises.

## 2) SQL / RLS (obligatoire)
- Executer `/Users/benjaminlevisse/Documents/PWA/docs/backend/user-progress.sql`
- Puis executer `/Users/benjaminlevisse/Documents/PWA/docs/backend/security-hardening.sql`

## 3) Vercel (obligatoire)
- Deployer avec le `vercel.json` versionne (headers de securite).
- Variables env uniquement dans Vercel, jamais dans le code.
- Ne jamais exposer la `service_role` key dans le front.

## 4) Compte admin modo (obligatoire)
- Garder un seul email admin dans `VITE_MODO_ADMIN_EMAIL`.
- Verifier que le bouton Modo n’apparait que pour cet email.

## 5) Exploitation (recommande)
- Rotation mot de passe admin reguliere.
- Export CSV mode modo uniquement si necessaire.
- Sauvegarde hebdomadaire de la base via dashboard Supabase.


# ElevateMe — frontend (React+TS clean-arch skeleton)

Stack: React 18 + TS 5 + Vite 6, React Router 7, CSS Modules, RHF + Zod, TanStack Query 5, Recharts.

Palette: preserved verbatim from `../src/index.css` (`:root` lines 4–12). Do NOT apply spec section-7 navy palette anywhere. All modules use `var(--*)` only.

## Commands

```bash
npm ci        # reproducible install from lockfile (commit package-lock.json)
npm run dev   # Vite dev, /api proxied to Java
npm run build # tsc --noEmit + vite build (must pass)
npm run test  # vitest run
npm run preview
```

> Lockfile note: versions are pinned exact (no `^` floating for new deps). Commit `package-lock.json`. `npm ci` is required in CI.

## Env

```
VITE_API_BASE=/api/v1
VITE_SUPABASE_URL=https://xyz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

- Never use service-role key in frontend.
- `VITE_API_BASE` defaults to same-origin `/api/v1`.
- Same-origin `/api` proxy note for guest cookies: dev proxy (`vite.config.ts`) forwards `/api -> http://localhost:8080` with `changeOrigin`. In prod, same-origin `/api` (gateway) preserves HttpOnly guest cookies; do NOT use cross-origin fetch with credentials split. `api.ts` uses `credentials: "include"` + `Authorization: Bearer <jwt>` when present.
- No localStorage for scores/messages: scores, drafts, messages live in React Query cache + server. Only persisted preference allowed in localStorage is `em:view-preference` (Student view / Parent view) and `em:companion-muted` / minimized. Never store JWT, scores, or message bodies.

## Architecture

```
src/
  app/router.tsx        # all routes + RequireAuth + RequireRole (DB roles only)
  styles/tokens.css     # :root copied verbatim from ../src/index.css
  features/<slice>/     # README + types.ts per slice (clean-arch feature folders)
  components/*.tsx      # presentation-only, CSS Modules with var(--*) only
  lib/api.ts scoring.ts insights.ts auth.tsx time.ts
  tests/*.test.ts       # vitest, golden fixtures
```

Guards read DB roles via `/me` (Supabase Auth + server roles). Never trust browser metadata / localStorage role. Shared `/app` for student+parent (no separate `/parent`).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { ApiError, get } from './api';

export type Role = 'student' | 'parent' | 'staff' | 'admin' | 'coordinator' | 'evaluator';
export type AccountStatus = 'Approved' | 'PendingReview' | 'Rejected' | 'Suspended' | 'ChangesRequested';
export interface Session { userId: string; email: string; roles: Role[]; activeRole: Role; status: AccountStatus }

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  /** Network / /me failure message. Null when signed-out (401) or healthy. Retry UI, never logout. */
  error: string | null;
  retry: () => void;
  signOut: () => Promise<void>;
  switchActiveRole: (r: Role) => void;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  loading: true,
  error: null,
  retry: () => {},
  signOut: async () => {},
  switchActiveRole: () => {},
});

export function useAuth() { return useContext(Ctx); }

export interface MeResponse {
  id: string;
  email: string;
  roles?: Role[];
  role?: Role;
  status?: AccountStatus;
}

// ---------------------------------------------------------------------------
// Pure helpers (DB-only roles, dashboard mapping, status gates, stale guards).
// Exported for SignInPage / router guards / unit tests.
// ---------------------------------------------------------------------------

/** Roles come ONLY from GET /me (DB). Supports {roles:[]} and legacy {role}. */
export function rolesFromMe(me: MeResponse): Role[] {
  if (me.roles && me.roles.length > 0) return me.roles;
  if (me.role) return [me.role];
  return ['student'];
}

/** Build a Session from /me, preserving the previous active role when still granted. */
export function buildSession(me: MeResponse, prevActive: Role | null): Session {
  const roles = rolesFromMe(me);
  const status: AccountStatus = me.status ?? 'Approved';
  const chosen = prevActive && roles.includes(prevActive) ? prevActive : roles[0];
  return { userId: me.id, email: me.email, roles, activeRole: chosen, status };
}

/** Role dashboard mapping: admin->/admin, staff family->/staff, student/parent->/app. */
export function dashboardForRoles(roles: Role[]): string {
  if (roles.includes('admin')) return '/admin';
  if (roles.includes('staff') || roles.includes('coordinator') || roles.includes('evaluator')) return '/staff';
  return '/app';
}

/** Does this role set permit visiting `next`? Used to preserve ?next= when allowed. */
export function roleAllowsPath(roles: Role[], next: string | null): boolean {
  if (!next) return false;
  const clean = next.split('?')[0].split('#')[0];
  if (clean.startsWith('/admin')) return roles.includes('admin');
  if (clean.startsWith('/staff')) {
    return (
      roles.includes('staff') ||
      roles.includes('coordinator') ||
      roles.includes('evaluator') ||
      roles.includes('admin')
    );
  }
  if (clean.startsWith('/evaluate')) {
    return (
      roles.includes('staff') ||
      roles.includes('coordinator') ||
      roles.includes('evaluator') ||
      roles.includes('admin')
    );
  }
  if (clean.startsWith('/app')) {
    return roles.includes('student') || roles.includes('parent') || roles.includes('admin');
  }
  // Public / shared routes (/, /programs, /sign-in, ...) are allowed for any signed-in user.
  if (clean.startsWith('/')) return true;
  return false;
}

/** Account-status gate target. Null means the account may proceed. */
export function accountStatusTarget(status: AccountStatus): string | null {
  if (status === 'PendingReview') return '/account/pending';
  if (status === 'Rejected') return '/account/rejected';
  if (status === 'Suspended') return '/account/suspended';
  return null;
}

function safeNextLocal(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

/**
 * Post-sign-in destination: status gate wins, then permitted ?next=, else role dashboard.
 * Never reads localStorage / JWT claims — roles come from the Session (GET /me DB-only).
 */
export function resolvePostSignInTarget(session: Session, next: string | null): string {
  const gated = accountStatusTarget(session.status);
  if (gated) return gated;
  const dashboard = dashboardForRoles([session.activeRole]);
  const safe = safeNextLocal(next);
  if (safe && roleAllowsPath(session.roles, safe)) return safe;
  return dashboard;
}

/** 401 from /me (expired/invalid token) => treat as signed-out. Anything else => network/retry. */
export function isUnauthorizedError(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 401;
  const status = (e as { status?: number } | null)?.status;
  return status === 401;
}

export type AuthEventAction = 'resolve' | 'clear';

/**
 * Route an onAuthStateChange event to an action.
 * SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED (+INITIAL_SESSION) with a user -> resolve.
 * SIGNED_OUT (or no user) -> clear session + query cache.
 */
export function authEventAction(event: string, hasUser: boolean): AuthEventAction {
  if (event === 'SIGNED_OUT' || !hasUser) return 'clear';
  return 'resolve';
}

/**
 * Stale-response guard: only apply a /me result when no newer request started
 * and the account has not changed since the request began.
 */
export function shouldApplyResolve(
  requestId: number,
  latestRequestId: number,
  expectedUserId: string | null,
  currentUserId: string | null,
): boolean {
  if (requestId !== latestRequestId) return false;
  if (expectedUserId !== currentUserId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Supabase Auth + /me roles. No mock auth. Logout clears cache.
 * Roles/status come ONLY from GET /me (DB) — never localStorage / JWT claims.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<Role | null>(null);

  const requestIdRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const activeRoleRef = useRef<Role | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeRoleRef.current = activeRole;
  }, [activeRole]);

  /**
   * Fetch GET /me for sbUser and publish the Session.
   * Sets loading true during resolve; ignores stale responses when a newer
   * request started or the account changed (requestId / userId guard).
   */
  const resolveSession = useCallback(async (sbUser: { id: string } | null, requestId: number) => {
    if (!sbUser) {
      if (!mountedRef.current) return;
      if (requestId !== requestIdRef.current) return;
      userIdRef.current = null;
      setSession(null);
      setError(null);
      setLoading(false);
      return;
    }
    const accountId = sbUser.id;
    // Claim this account synchronously so a concurrent sign-in can invalidate us.
    userIdRef.current = accountId;
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const me = await get<MeResponse>('/me');
      if (!mountedRef.current) return;
      if (!shouldApplyResolve(requestId, requestIdRef.current, accountId, userIdRef.current)) return;
      const built = buildSession(me, activeRoleRef.current);
      setActiveRole(built.activeRole);
      activeRoleRef.current = built.activeRole;
      setSession(built);
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      if (!shouldApplyResolve(requestId, requestIdRef.current, accountId, userIdRef.current)) return;
      if (isUnauthorizedError(e)) {
        // 401 from /me (expired/invalid token) => treat as signed out; router
        // preserves return URL via ?next= for re-auth.
        setSession(null);
        setError(null);
      } else {
        // Network / 5xx from /me => retry UI, NOT logout. Guards show
        // data-testid="auth-error" with a Retry button instead of redirecting.
        setSession(null);
        setError(e instanceof Error ? e.message || 'Failed to load account.' : 'Failed to load account.');
      }
    } finally {
      if (!mountedRef.current) return;
      if (!shouldApplyResolve(requestId, requestIdRef.current, accountId, userIdRef.current)) return;
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sbUser = data.session?.user ?? null;
        const id = requestIdRef.current + 1;
        requestIdRef.current = id;
        await resolveSession(sbUser as { id: string } | null, id);
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : 'Failed to load account.');
          setLoading(false);
        }
      }
    })();
  }, [resolveSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const sbUser = data.session?.user ?? null;
      const id = requestIdRef.current + 1;
      requestIdRef.current = id;
      await resolveSession(sbUser as { id: string } | null, id);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, sbSession) => {
      const action = authEventAction(event, !!sbSession?.user);
      if (action === 'clear') {
        // Invalidate any in-flight /me so a slow resolve cannot repopulate
        // the session after logout / account switch.
        requestIdRef.current += 1;
        userIdRef.current = null;
        setSession(null);
        setError(null);
        setLoading(false);
        qc.clear();
        return;
      }
      if (sbSession?.user) {
        const id = requestIdRef.current + 1;
        requestIdRef.current = id;
        void resolveSession(sbSession.user as { id: string }, id);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [qc, resolveSession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
    setSession(null);
    setError(null);
  }, [qc]);

  const switchActiveRole = useCallback((r: Role) => {
    // Presentation-only role switch within granted roles; never grants staff rights.
    setActiveRole(r);
    activeRoleRef.current = r;
    setSession((s) => {
      if (!s) return s;
      if (!s.roles.includes(r)) return s; // refuse privilege escalation via UI
      return { ...s, activeRole: r };
    });
  }, []);

  const value = useMemo(
    () => ({ session, loading, error, retry, signOut, switchActiveRole }),
    [session, loading, error, retry, signOut, switchActiveRole],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

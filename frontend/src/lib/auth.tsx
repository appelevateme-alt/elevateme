import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { get } from './api';

export type Role = 'student' | 'parent' | 'staff' | 'admin' | 'coordinator' | 'evaluator';
export type AccountStatus = 'Approved' | 'PendingReview' | 'Rejected' | 'Suspended' | 'ChangesRequested';
export interface Session { userId: string; email: string; roles: Role[]; activeRole: Role; status: AccountStatus }

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  switchActiveRole: (r: Role) => void;
}

const Ctx = createContext<AuthCtx>({ session: null, loading: true, signOut: async () => {}, switchActiveRole: () => {} });

export function useAuth() { return useContext(Ctx); }

interface MeResponse {
  id: string;
  email: string;
  roles?: Role[];
  role?: Role;
  status?: AccountStatus;
}

/**
 * Supabase Auth + /me roles. No mock auth. Logout clears cache.
 * Roles/status come ONLY from GET /me (DB) — never localStorage / JWT claims.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState<Role | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const sbUser = data.session?.user;
      if (!sbUser) { if (mounted) { setSession(null); setLoading(false); } return; }
      try {
        const me = await get<MeResponse>('/me');
        if (!mounted) return;
        // Roles from /me only (DB). Support both {roles:[]} and legacy {role}.
        const roles: Role[] = me.roles && me.roles.length > 0
          ? me.roles
          : me.role ? [me.role] : (['student'] as Role[]);
        const status: AccountStatus = me.status ?? 'Approved';
        const chosen = activeRole && roles.includes(activeRole) ? activeRole : roles[0];
        setSession({ userId: me.id, email: me.email, roles, activeRole: chosen, status });
      } catch {
        // 401 from /me (expired/invalid token) => treat as signed out; router
        // preserves return URL via ?next= for re-auth.
        if (mounted) setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sbSession) => {
      if (!sbSession?.user) { setSession(null); qc.clear(); }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
    setSession(null);
  }, [qc]);

  const switchActiveRole = useCallback((r: Role) => {
    // Presentation-only role switch within granted roles; never grants staff rights.
    setActiveRole((prev) => {
      void prev;
      return r;
    });
    setSession((s) => {
      if (!s) return s;
      if (!s.roles.includes(r)) return s; // refuse privilege escalation via UI
      return { ...s, activeRole: r };
    });
  }, []);

  const value = useMemo(() => ({ session, loading, signOut, switchActiveRole }), [session, loading, signOut, switchActiveRole]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

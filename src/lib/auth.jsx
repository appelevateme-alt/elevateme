import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient.js';

const ROLE_HOME = {
  student: '/student',
  parent: '/parent',
  coordinator: '/coordinator',
  evaluator: '/evaluator',
  admin: '/admin',
};

export function roleHome(role) {
  return ROLE_HOME[role];
}

const AuthContext = createContext(null);

function toSession(user, profile) {
  if (!user) return null;
  if (!profile) {
    const metaName = user.user_metadata?.full_name;
    const metaRole = user.user_metadata?.active_role;
    return {
      userId: user.id,
      name: metaName || user.email || 'Account',
      email: user.email || '',
      role: metaRole || 'student',
      availableRoles: metaRole ? [metaRole] : ['student'],
      status: 'PendingReview',
      elevateMeId: null,
    };
  }
  const activeRole = profile.active_role || (Array.isArray(profile.roles) && profile.roles[0]) || 'student';
  const availableRoles = Array.isArray(profile.roles) && profile.roles.length > 0 ? profile.roles : [activeRole];
  return {
    userId: user.id,
    name: profile.full_name || profile.email || user.email || 'Account',
    email: profile.email || user.email || '',
    role: activeRole,
    availableRoles,
    status: profile.status || 'PendingReview',
    elevateMeId: profile.elevate_me_id || null,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadForUser = useCallback(async (user) => {
    if (!user) {
      setSession(null);
      return null;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,full_name,elevate_me_id,status,active_role,roles')
        .eq('id', user.id)
        .single();
      if (error || !data) {
        const fallback = toSession(user, null);
        setSession(fallback);
        return fallback;
      }
      const next = toSession(user, data);
      setSession(next);
      return next;
    } catch {
      const fallback = toSession(user, null);
      setSession(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user ?? null;
        if (!mounted) return;
        await loadForUser(user);
      } catch {
        if (mounted) setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const user = newSession?.user ?? null;
      await loadForUser(user);
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [loadForUser]);

  const signOut = useCallback(async () => {
    try {
      sessionStorage.removeItem('em-signup-draft');
    } catch {
      /* ignore */
    }
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setSession(null);
  }, []);

  const switchActiveRole = useCallback(
    async (role) => {
      if (!role || !session) return false;
      if (!session.availableRoles?.includes(role)) return false;
      if (session.role === role) return true;
      try {
        const { error } = await supabase.from('profiles').update({ active_role: role }).eq('id', session.userId);
        if (error) return false;
        setSession((s) => (s ? { ...s, role } : s));
        return true;
      } catch {
        return false;
      }
    },
    [session],
  );

  const value = useMemo(() => ({ session, loading, signOut, switchActiveRole }), [session, loading, signOut, switchActiveRole]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const MockAuthProvider = AuthProvider;

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const useMockAuth = useAuth;

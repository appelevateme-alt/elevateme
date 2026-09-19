import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { mockUsers } from './mock-data.js';

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

// Demo auth: starts as Student; the top-bar role switcher swaps between the
// five seeded users so each shell can be reviewed without a backend.
export function MockAuthProvider({ children }) {
  const [userId, setUserId] = useState('u-student');

  const session = useMemo(() => {
    const u = mockUsers.find((x) => x.id === userId) || mockUsers[0];
    return {
      userId: u.id,
      name: u.fullName,
      email: u.email,
      role: u.activeRole,
      availableRoles: u.roles,
      status: u.status,
    };
  }, [userId]);

  const switchRole = useCallback((role) => {
    if (role === 'evaluator') {
      const evalUser = mockUsers.find((u) => u.roles.includes('evaluator'));
      if (evalUser) setUserId(evalUser.id);
      return;
    }
    const match = mockUsers.find((u) => u.activeRole === role);
    if (match) setUserId(match.id);
  }, []);

  const signOut = useCallback(() => setUserId('u-student'), []);

  const value = useMemo(() => ({ session, switchRole, signOut }), [session, switchRole, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMockAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useMockAuth must be used inside MockAuthProvider');
  return ctx;
}

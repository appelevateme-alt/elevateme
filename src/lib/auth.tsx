"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Role } from "./types";
import { mockUsers } from "./mock-data";

interface MockSession {
  userId: string;
  name: string;
  email: string;
  role: Role;
  availableRoles: Role[];
  status: string;
}

const AuthContext = createContext<{
  session: MockSession;
  switchRole: (role: Role) => void;
  signOut: () => void;
} | null>(null);

const ROLE_HOME: Record<Role, string> = {
  student: "/student",
  parent: "/parent",
  coordinator: "/coordinator",
  evaluator: "/evaluator",
  admin: "/admin",
};

export function roleHome(role: Role): string {
  return ROLE_HOME[role];
}

// Demo auth: starts as Student; TopBar role-switcher swaps between the
// five seeded users so each shell can be reviewed without a backend.
export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState("u-student");

  const session = useMemo<MockSession>(() => {
    const u = mockUsers.find((x) => x.id === userId) ?? mockUsers[0];
    return {
      userId: u.id,
      name: u.fullName,
      email: u.email,
      role: u.activeRole,
      availableRoles: u.roles,
      status: u.status,
    };
  }, [userId]);

  const switchRole = useCallback((role: Role) => {
    // Prefer a user whose primary activeRole matches; fall back to
    // coordinator (who holds coordinator+evaluator) for evaluator demo.
    if (role === "evaluator") {
      const evalUser = mockUsers.find((u) => u.roles.includes("evaluator"));
      if (evalUser) setUserId(evalUser.id);
      return;
    }
    const match = mockUsers.find((u) => u.activeRole === role);
    if (match) setUserId(match.id);
  }, []);

  const signOut = useCallback(() => setUserId("u-student"), []);

  const value = useMemo(
    () => ({ session, switchRole, signOut }),
    [session, switchRole, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMockAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useMockAuth must be used inside MockAuthProvider");
  return ctx;
}

"use client";

import Link from "next/link";
import type { Role } from "@/lib/types";
import { roleHome, useMockAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

// Client-side mock gate. Real server authorization ships with the backend;
// this keeps Phase 1 navigation honest about who may see what.
export function RequireRole({
  allow,
  children,
  label,
}: {
  allow: Role[];
  children: React.ReactNode;
  label: string;
}) {
  const { session, switchRole } = useMockAuth();
  if (allow.includes(session.role)) return <>{children}</>;
  const fallback = roleHome(allow[0]);
  return (
    <div className="em-card p-6" role="alert">
      <p className="em-item-title">Permission denied</p>
      <p className="mt-1 text-sm text-gray-600">
        The {label} workspace requires one of: {allow.join(", ")}. You are previewing as{" "}
        {session.role}. Use the role switcher to continue, or open {fallback}.
      </p>
      <div className="mt-3 flex gap-2">
        <Link href={fallback}>
          <Button variant="secondary">Open {allow[0]} workspace</Button>
        </Link>
        <Button variant="ghost" onClick={() => switchRole(allow[0])}>
          Switch to {allow[0]}
        </Button>
      </div>
    </div>
  );
}

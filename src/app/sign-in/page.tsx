"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { roleHome, useMockAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export default function SignInPage() {
  const { switchRole } = useMockAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>("student");

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <PageHeader title="Sign in" description="Mock sign-in for Phase 1 — real email verification and approvals ship with the backend." />
      <Card title="Welcome back" meta="Email + password (mocked)">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            switchRole(role);
            router.push(roleHome(role));
          }}
        >
          <Field label="Email"><TextInput type="email" required placeholder="you@example.edu" defaultValue="amaya@example.edu" /></Field>
          <Field label="Password"><TextInput type="password" required placeholder="••••••••" defaultValue="password" /></Field>
          <Field label="Preview as role" hint="Demo only — server role checks land with the backend.">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="student">Student</option>
              <option value="parent">Parent</option>
              <option value="coordinator">Coordinator</option>
              <option value="evaluator">Evaluator</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Button type="submit">Sign in</Button>
          <p className="text-sm">
            <Link href="/forgot-password" className="font-semibold text-[#1d4ed8]">Forgot password?</Link>
            <span className="em-meta"> · New here? </span>
            <Link href="/sign-up" className="font-semibold text-[#1d4ed8]">Create an account</Link>
          </p>
          <p className="em-meta">Pending, rejected, suspended, or changes-requested accounts see an explicit status screen after sign-in (mocked as Approved here).</p>
        </form>
      </Card>
    </div>
  );
}

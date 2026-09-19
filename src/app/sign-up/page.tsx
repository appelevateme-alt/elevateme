"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert, Progress } from "@/components/ui/Feedback";
import { roleHome, useMockAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

type Draft = {
  role: Role;
  fullName: string;
  email: string;
  password: string;
  institute: string;
  dob: string;
  referee: string;
  phone: string;
  consent: boolean;
};

const EMPTY: Draft = {
  role: "student",
  fullName: "",
  email: "",
  password: "",
  institute: "",
  dob: "",
  referee: "",
  phone: "",
  consent: false,
};

const STEPS = ["Choose role", "Account details", "Profile information", "Photo and verification", "Review and submit"] as const;

export default function SignUpPage() {
  const { switchRole } = useMockAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  // Safe draft data locally during the active session (§10.2) — lazy init, no effect setState.
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem("em-signup-draft") : null;
      if (raw) return { ...EMPTY, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return EMPTY;
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  // Safe draft data locally during the active session (§10.2).
  useEffect(() => {
    try {
      sessionStorage.setItem("em-signup-draft", JSON.stringify(draft));
    } catch { /* ignore */ }
  }, [draft]);

  const set = (k: keyof Draft, v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!draft.fullName.trim()) e.fullName = "Enter your full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email)) e.email = "Enter a valid email address.";
    if (draft.password.length < 8) e.password = "Password must be at least 8 characters.";
    if ((draft.role === "student" || draft.role === "coordinator") && !draft.institute.trim())
      e.institute = "Enter your institute.";
    if (draft.role === "student" && !draft.dob) e.dob = "Enter your date of birth.";
    return e;
  }, [draft]);

  const stepErrorList = (s: number): string[] => {
    if (s === 2) return [errors.fullName, errors.email, errors.password].filter(Boolean) as string[];
    if (s === 3) return [errors.institute, errors.dob].filter(Boolean) as string[];
    if (s === 5) return [...Object.values(errors), ...(!draft.consent ? ["Accept consent and privacy to submit."] : [])];
    return [];
  };

  if (done) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <Eyebrow>Account created</Eyebrow>
        <PageHeader title="Pending approval" description="Your account is awaiting email verification and role approval." />
        <Alert tone="info" title="What happens next">
          Verify your email, then a Diplomatic Impact administrator reviews {draft.role} access.
          You will be notified when your account is approved. Students receive an ElevateMe ID at that point.
        </Alert>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => { switchRole(draft.role === "coordinator" ? "coordinator" : "student"); router.push(roleHome(draft.role === "coordinator" ? "coordinator" : "student")); }}>
            Preview {draft.role} workspace
          </Button>
          <Button variant="secondary" onClick={() => { sessionStorage.removeItem("em-signup-draft"); setDraft(EMPTY); setStep(1); setDone(false); }}>
            Start over
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <Eyebrow>Create your account</Eyebrow>
      <PageHeader title="Join ElevateMe" description="Short steps instead of one long form. Drafts stay on this device during the session." />
      <Progress value={step} max={STEPS.length} label={STEPS[step - 1]} />

      {submitErrors.length > 0 && (
        <div role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-900">Check {submitErrors.length} item(s) before continuing</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
            {submitErrors.map((m, i) => (<li key={i}>{m}</li>))}
          </ul>
        </div>
      )}

      <Card title={STEPS[step - 1]} meta={`Step ${step} of ${STEPS.length}`}>
        {step === 1 && (
          <Field label="Choose your role">
            <Select value={draft.role} onChange={(e) => set("role", e.target.value as Role)}>
              <option value="student">Student</option>
              <option value="coordinator">Teacher / programme coordinator</option>
              <option value="parent">Parent or guardian (via invitation)</option>
            </Select>
          </Field>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <Field label="Full name">
              <TextInput
                value={draft.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                aria-invalid={!!errors.fullName}
                placeholder="Full name"
              />
              {touched.fullName && errors.fullName && <p role="alert" className="mt-1 text-sm text-red-700">{errors.fullName}</p>}
            </Field>
            <Field label="Email">
              <TextInput
                type="email"
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                aria-invalid={!!errors.email}
                placeholder="you@example.edu"
              />
              {touched.email && errors.email && <p role="alert" className="mt-1 text-sm text-red-700">{errors.email}</p>}
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <TextInput
                type="password"
                value={draft.password}
                onChange={(e) => set("password", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                aria-invalid={!!errors.password}
                placeholder="Choose a password"
              />
              {touched.password && errors.password && <p role="alert" className="mt-1 text-sm text-red-700">{errors.password}</p>}
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            {(draft.role === "student" || draft.role === "coordinator") && (
              <Field label="Institute">
                <TextInput value={draft.institute} onChange={(e) => set("institute", e.target.value)} onBlur={() => setTouched((t) => ({ ...t, institute: true }))} placeholder="Institute" />
                {touched.institute && errors.institute && <p role="alert" className="mt-1 text-sm text-red-700">{errors.institute}</p>}
              </Field>
            )}
            {draft.role === "student" && (
              <>
                <Field label="Date of birth" hint="Private. Never exposed via ElevateMe ID.">
                  <TextInput type="date" value={draft.dob} onChange={(e) => set("dob", e.target.value)} onBlur={() => setTouched((t) => ({ ...t, dob: true }))} />
                  {touched.dob && errors.dob && <p role="alert" className="mt-1 text-sm text-red-700">{errors.dob}</p>}
                </Field>
                <Field label="Referee name / contact" hint="Verification only; hidden outside authorized staff.">
                  <TextInput value={draft.referee} onChange={(e) => set("referee", e.target.value)} placeholder="Referee (optional for draft)" />
                </Field>
              </>
            )}
            {draft.role === "coordinator" && (
              <Field label="Phone">
                <TextInput value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone" />
              </Field>
            )}
            {draft.role === "parent" && (
              <Alert tone="info" title="Invitation required">
                Parent accounts link through a time-limited student-issued or admin-issued invitation — never open ID lookup.
              </Alert>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <Field label="Profile photo" hint="JPG or PNG, max 5 MB. Preview only in this mock.">
              <TextInput type="file" accept="image/png,image/jpeg" aria-label="Profile photo" />
            </Field>
            <Alert tone="info" title="Verification">
              Students: referee details verify institute membership. Coordinators: institute email verifies employment. National ID is not requested in this mock.
            </Alert>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-3 text-sm">
            <dl className="grid gap-2">
              <div><dt className="em-meta">Role</dt><dd>{draft.role}</dd></div>
              <div><dt className="em-meta">Name</dt><dd>{draft.fullName || "—"}</dd></div>
              <div><dt className="em-meta">Email</dt><dd>{draft.email || "—"}</dd></div>
              <div><dt className="em-meta">Institute</dt><dd>{draft.institute || "—"}</dd></div>
            </dl>
            <label className="flex min-h-[44px] items-start gap-2 rounded border border-gray-300 p-3">
              <input type="checkbox" checked={draft.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 h-4 w-4" />
              <span>I accept the consent and privacy policy. I understand student records are sensitive and approvals are required.</span>
            </label>
          </div>
        )}

        <div className="mt-4 flex justify-between gap-2">
          <Button variant="secondary" disabled={step === 1} onClick={() => { setStep((s) => Math.max(1, s - 1)); setSubmitErrors([]); }}>
            Back
          </Button>
          {step < STEPS.length ? (
            <Button
              onClick={() => {
                const list = stepErrorList(step);
                if (list.length > 0) {
                  setSubmitErrors(list);
                  setTouched({ fullName: true, email: true, password: true, institute: true, dob: true });
                  return;
                }
                setSubmitErrors([]);
                setStep((s) => Math.min(STEPS.length, s + 1));
              }}
            >
              Continue
            </Button>
          ) : (
            <Button
              onClick={() => {
                const list = stepErrorList(5);
                if (list.length > 0) {
                  setSubmitErrors(list);
                  return;
                }
                setSubmitErrors([]);
                setDone(true);
              }}
            >
              Submit for approval
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

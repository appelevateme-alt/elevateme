"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <Eyebrow>Account recovery</Eyebrow>
      <PageHeader title="Forgot password" description="Enter your account email. If it exists, a time-limited reset link is sent." />
      <Card title="Request reset link" meta="Mock — no email is sent">
        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <Field label="Email"><TextInput type="email" required placeholder="you@example.edu" /></Field>
          <div className="flex gap-2">
            <Button type="submit">Send reset link</Button>
            <Link href="/sign-in"><Button variant="secondary">Back to sign in</Button></Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

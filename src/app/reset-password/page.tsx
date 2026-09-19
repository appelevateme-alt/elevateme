"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <Eyebrow>Account recovery</Eyebrow>
      <PageHeader title="Reset password" description="Links expire. After reset, sign in again on all devices." />
      <Card title="Choose a new password" meta="Mock — validation mirrors signup rules">
        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <Field label="New password" hint="At least 8 characters."><TextInput type="password" required placeholder="New password" /></Field>
          <Field label="Confirm password"><TextInput type="password" required placeholder="Repeat password" /></Field>
          <div className="flex gap-2">
            <Button type="submit">Reset password</Button>
            <Link href="/sign-in"><Button variant="secondary">Back to sign in</Button></Link>
          </div>
        </form>
      </Card>
    </div>
  );
}

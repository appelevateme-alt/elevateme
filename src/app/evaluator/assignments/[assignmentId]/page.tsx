"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { FilterBar, MetricLine } from "@/components/ui/Data";
import { Field, TextInput } from "@/components/ui/Field";
import { Table } from "@/components/ui/Table";
import { mockRegistrations, mockSessions } from "@/lib/mock-data";

// Assignment page (§10.8): session context, completion, searchable list,
// status markers, previous/next student navigation without losing drafts.
export default function AssignmentPage() {
  const params = useParams<{ assignmentId: string }>();
  const session = mockSessions.find((s) => s.id === params.assignmentId) ?? mockSessions[0];
  const [query, setQuery] = useState("");
  const students = useMemo(
    () => mockRegistrations.filter((r) => !query || `${r.studentName} ${r.elevateMeId}`.toLowerCase().includes(query.toLowerCase())),
    [query]
  );
  const done = mockRegistrations.filter((r) => r.evaluationState === "Submitted" || r.evaluationState === "Locked").length;

  return (
    <div>
      <Eyebrow>Assignment</Eyebrow>
      <PageHeader title={session.title} description={`${session.topic} · ${session.date} · ${session.venue}`} />
      <Card title="Instructions" meta="Session context always visible">
        <p className="text-sm text-gray-700">Score all ten criteria per student. Save drafts freely; submitting locks the sheet. Reopen is audited.</p>
        <div className="mt-2"><MetricLine label="Completion" value={`${done} / ${mockRegistrations.length} submitted`} /></div>
      </Card>
      <h2 className="em-section-title mb-2 mt-6">Students</h2>
      <Card title="Student list" meta="Searchable · status markers">
        <FilterBar>
          <Field label="Search students">
            <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or ElevateMe ID" className="sm:w-64" />
          </Field>
        </FilterBar>
        {students.length === 0 ? (
          <div className="mt-3"><EmptyState title="No matching students" body="Clear the search to see the full list." action={<Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button>} /></div>
        ) : (
          <div className="mt-3">
            <Table
              headers={["Student", "ElevateMe ID", "Status", ""]}
              rows={students.map((r, i) => [
                r.studentName,
                r.elevateMeId,
                <Badge key={r.id} value={r.evaluationState} />,
                <span key={`${r.id}-nav`} className="flex gap-2">
                  <Link href={`/evaluator/assignments/${session.id}/students/${r.elevateMeId}`}><Button variant="secondary">Evaluate</Button></Link>
                  {students[i + 1] && (
                    <Link href={`/evaluator/assignments/${session.id}/students/${students[i + 1].elevateMeId}`}><Button variant="ghost">Next →</Button></Link>
                  )}
                </span>,
              ])}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

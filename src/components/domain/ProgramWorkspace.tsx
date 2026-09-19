"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DefinitionList } from "@/components/ui/Data";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockPrograms, mockRegistrations, mockSessions } from "@/lib/mock-data";

const TABS = ["Overview", "Sessions", "Students", "Evaluators", "Performance", "Settings"] as const;
export type WorkspaceTab = (typeof TABS)[number];

// Coordinator program workspace (§10.6): tabs + header status + next valid action.
export function ProgramWorkspace({ programId, active }: { programId: string; active: WorkspaceTab }) {
  const program = mockPrograms.find((p) => p.id === programId) ?? mockPrograms[0];
  const sessions = mockSessions.filter((s) => s.programId === program.id);
  const roster = mockRegistrations.filter((r) => r.programId === program.id);

  const nextAction: Record<string, string> = {
    Draft: "Submit for approval",
    ChangesRequested: "Revise and resubmit",
    Approved: "Publish to directory",
    Published: "Close registration when full",
    InProgress: "Track evaluations",
    UnderReview: "Awaiting admin review",
  };

  const tabHref = (t: WorkspaceTab) =>
    t === "Overview" ? `/coordinator/programs/${program.id}` : `/coordinator/programs/${program.id}/${t.toLowerCase()}`;

  return (
    <div>
      <PageHeader
        title={program.title}
        description={`${program.institute} · ${program.startDate} → ${program.endDate} · Next: ${nextAction[program.status] ?? program.status}`}
        action={
          <div className="flex gap-2">
            <Badge value={program.status} />
            <Link href={`/coordinator/programs/${program.id}/edit`}><Button variant="secondary">Edit</Button></Link>
          </div>
        }
      />
      <nav aria-label="Program workspace" className="mb-4 border-b border-gray-200">
        <ul className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <li key={t}>
              <Link
                href={tabHref(t)}
                aria-current={active === t ? "page" : undefined}
                className={`block min-h-[44px] whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                  active === t ? "border-[#1d4ed8] text-[#1d4ed8]" : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                {t === "Sessions" ? "Sessions/Committees" : t}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {active === "Overview" && (
        <DefinitionList
          items={[
            ["Type", program.singleEventType ?? program.category],
            ["Venue", program.venue],
            ["Capacity", `${program.registered}/${program.capacity}`],
            ["Description", program.description],
          ]}
        />
      )}
      {active === "Sessions" && (
        <Table headers={["Session", "Topic", "Date", "Venue"]} rows={sessions.map((s) => [s.title, s.topic, s.date, s.venue])} />
      )}
      {active === "Students" && (
        <Table
          headers={["Student", "ElevateMe ID", "Allocation", "Registration", "Evaluation"]}
          rows={roster.map((r) => [r.studentName, r.elevateMeId, r.allocation, <Badge key={`${r.id}-s`} value={r.status} />, <Badge key={`${r.id}-e`} value={r.evaluationState} />])}
        />
      )}
      {active === "Evaluators" && (
        <Table headers={["Evaluator", "Session", "Access"]} rows={[["David Mensah", sessions[0]?.title ?? "—", <Badge key="e" value="Approved" />]]} />
      )}
      {active === "Performance" && (
        <p className="text-sm text-gray-600">Individual and aggregate views unlock in Performance once evaluations are released.</p>
      )}
      {active === "Settings" && (
        <p className="text-sm text-gray-600">Registration window, capacity, visibility, and contact details. Editing is restricted after submission according to lifecycle status.</p>
      )}
    </div>
  );
}

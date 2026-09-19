"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { FilterBar } from "@/components/ui/Data";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Table } from "@/components/ui/Table";
import { mockRegistrations } from "@/lib/mock-data";

// Student Details Sheet (§10.7): numbered rows, search, filters, sortable name/status.
export default function CoordinatorStudents() {
  const [query, setQuery] = useState("");
  const [regFilter, setRegFilter] = useState("all");
  const [evalFilter, setEvalFilter] = useState("all");
  const [sort, setSort] = useState<"name-asc" | "name-desc" | "status">("name-asc");

  const rows = useMemo(() => {
    const f = mockRegistrations.filter((r) => {
      if (query && !`${r.studentName} ${r.elevateMeId}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (regFilter !== "all" && r.status !== regFilter) return false;
      if (evalFilter !== "all" && r.evaluationState !== evalFilter) return false;
      return true;
    });
    return [...f].sort((a, b) => {
      if (sort === "name-asc") return a.studentName.localeCompare(b.studentName);
      if (sort === "name-desc") return b.studentName.localeCompare(a.studentName);
      return a.status.localeCompare(b.status);
    });
  }, [query, regFilter, evalFilter, sort]);

  return (
    <div>
      <PageHeader title="Students" description="Student Details Sheet across programs you manage." action={<Button variant="secondary">Export CSV (Phase 3)</Button>} />
      <Card title="Roster" meta={`${rows.length} records · mobile shows stacked rows`}>
        <FilterBar>
          <Field label="Search name or ElevateMe ID">
            <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Amaya or EM-00100" className="sm:w-64" />
          </Field>
          <Field label="Registration">
            <Select value={regFilter} onChange={(e) => setRegFilter(e.target.value)} className="sm:w-44">
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Waitlisted">Waitlisted</option>
              <option value="Attended">Attended</option>
            </Select>
          </Field>
          <Field label="Evaluation">
            <Select value={evalFilter} onChange={(e) => setEvalFilter(e.target.value)} className="sm:w-44">
              <option value="all">All</option>
              <option value="NotStarted">Not Started</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Locked">Locked</option>
            </Select>
          </Field>
          <Field label="Sort">
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="sm:w-44">
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
              <option value="status">Status</option>
            </Select>
          </Field>
        </FilterBar>
        {rows.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No matching students" body="Try widening search or clearing filters." action={<Button variant="secondary" onClick={() => { setQuery(""); setRegFilter("all"); setEvalFilter("all"); }}>Clear filters</Button>} />
          </div>
        ) : (
          <div className="mt-3">
            <Table
              headers={["#", "Student", "ElevateMe ID", "Allocation", "Registration", "Evaluation", ""]}
              rows={rows.map((r, i) => [
                String(i + 1),
                <Link key={`${r.id}-n`} href={`/coordinator/students/${r.elevateMeId}`} className="font-semibold text-[#1d4ed8]">{r.studentName}</Link>,
                r.elevateMeId,
                r.allocation,
                <Badge key={`${r.id}-1`} value={r.status} />,
                <Badge key={`${r.id}-2`} value={r.evaluationState} />,
                <Button key={`${r.id}-3`} variant="secondary">Confirm</Button>,
              ])}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

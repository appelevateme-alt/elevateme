"use client";

import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { FilterBar, Pagination } from "@/components/ui/Data";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Feedback";
import { ProgramRow } from "@/components/domain/Domain";
import { mockPrograms } from "@/lib/mock-data";

const PAGE_SIZE = 5;

export default function ProgramsPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [institute, setInstitute] = useState("all");
  const [page, setPage] = useState(1);
  const [loading] = useState(false); // mock: flip to preview skeleton rows

  const institutes = useMemo(() => Array.from(new Set(mockPrograms.map((p) => p.institute))), []);

  const filtered = mockPrograms.filter((p) => {
    if (p.status !== "Published" && p.status !== "InProgress") return false;
    if (query && !`${p.title} ${p.description}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (type !== "all" && (p.singleEventType ?? p.category) !== type) return false;
    if (institute !== "all" && p.institute !== institute) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = query !== "" || type !== "all" || institute !== "all";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <Eyebrow>Public directory</Eyebrow>
      <PageHeader
        title="Approved programs and events"
        description="Search approved programs. Public listing shows Published programs only — sign in to join."
      />
      <FilterBar>
        <Field label="Search">
          <TextInput
            type="search"
            placeholder="Search title or description"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="sm:w-64"
          />
        </Field>
        <Field label="Program type">
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="sm:w-52">
            <option value="all">All types</option>
            <option value="ModelUN">Model UN</option>
            <option value="FriendlyDebate">Friendly Debate</option>
            <option value="Competition">Competition</option>
            <option value="ContinuousProgramme">Continuous Programme</option>
            <option value="SpecialProgramme">Special Programme</option>
          </Select>
        </Field>
        <Field label="Institute">
          <Select value={institute} onChange={(e) => { setInstitute(e.target.value); setPage(1); }} className="sm:w-52">
            <option value="all">All institutes</option>
            {institutes.map((i) => (<option key={i} value={i}>{i}</option>))}
          </Select>
        </Field>
        {hasFilters && (
          <Button variant="ghost" onClick={() => { setQuery(""); setType("all"); setInstitute("all"); setPage(1); }}>
            Clear filters
          </Button>
        )}
      </FilterBar>

      <div className="mt-4 border-t border-gray-200" aria-live="polite">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : filtered.length === 0 && !hasFilters ? (
          <EmptyState title="No published programs" body="New approved programs will appear here. Check back soon." />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No matching programs"
            body="No programs match these filters. Try widening the search."
            action={<Button variant="secondary" onClick={() => { setQuery(""); setType("all"); setInstitute("all"); setPage(1); }}>Clear filters</Button>}
          />
        ) : (
          visible.map((p) => <ProgramRow key={p.id} program={p} />)
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

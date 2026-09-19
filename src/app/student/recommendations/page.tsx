"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { FilterBar } from "@/components/ui/Data";
import { Field, Select } from "@/components/ui/Field";
import { RecommendationItem } from "@/components/domain/Domain";
import { mockRecommendations } from "@/lib/mock-data";

// Recommendations as flat announcement feed (§10.10): filters, bordered
// records, Mark complete. No comments, reactions, or kanban.
export default function StudentRecommendations() {
  const [status, setStatus] = useState("all");
  const [skill, setSkill] = useState("all");
  const [done, setDone] = useState<Record<string, boolean>>({});

  const filtered = mockRecommendations.filter((r) => {
    if (status !== "all" && r.status !== status && !(status === "Completed" && done[r.id])) return false;
    if (skill !== "all" && r.skill !== skill) return false;
    return true;
  });

  return (
    <div>
      <Eyebrow>Development</Eyebrow>
      <PageHeader title="Recommendations" description="One-way development actions from Diplomatic Impact." />
      <FilterBar>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
            <option value="all">All</option>
            <option value="New">New</option>
            <option value="Viewed">Viewed</option>
            <option value="Completed">Completed</option>
          </Select>
        </Field>
        <Field label="Skill">
          <Select value={skill} onChange={(e) => setSkill(e.target.value)} className="sm:w-52">
            <option value="all">All skills</option>
            <option value="Counter Arguments">Counter Arguments</option>
            <option value="Sound">Sound</option>
          </Select>
        </Field>
      </FilterBar>
      <div className="mt-2 border-t border-gray-200">
        {filtered.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No recommendations for these filters" body="Try a different status or skill." action={<Button variant="secondary" onClick={() => { setStatus("all"); setSkill("all"); }}>Clear filters</Button>} />
          </div>
        ) : (
          filtered.map((r) => (
            <RecommendationItem
              key={r.id}
              title={r.title}
              meta={`${r.skill} · priority ${r.priority} · From Diplomatic Impact`}
              action={r.action}
              reason={r.reason}
              footer={
                <>
                  <Badge value={done[r.id] ? "Completed" : r.status} />
                  {!done[r.id] && <Button variant="secondary" onClick={() => setDone((d) => ({ ...d, [r.id]: true }))}>Mark complete</Button>}
                </>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

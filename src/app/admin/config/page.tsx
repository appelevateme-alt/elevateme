import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { TEN_CRITERIA } from "@/lib/types";

export default function AdminConfig() {
  return (
    <div>
      <PageHeader title="Configuration" description="Program types, criteria, rubrics — all versioned. History keeps its original rubric." />
      <Card title="Evaluation template v1" meta="10 criteria · scale TBC (50 + L/G/VG/E)">
        <ul className="grid gap-1 text-sm text-gray-700 md:grid-cols-2">
          {TEN_CRITERIA.map((c) => (
            <li key={c.key} className="rounded border border-gray-200 px-3 py-2">
              <strong>{c.label}</strong>
              <span className="em-meta block">{c.help}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

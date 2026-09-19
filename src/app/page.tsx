import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { publishedPrograms } from "@/lib/mock-data";

export default function Home() {
  const programs = publishedPrograms();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        title="Grow through speaking, debate, and leadership"
        description="ElevateMe turns participation in MUN, debate, and continuous speaking programs into a structured performance record — with ten-criterion evaluation, insights, and recommendations."
        action={
          <div className="flex gap-2">
            <Link href="/programs"><Button variant="secondary">Browse programs</Button></Link>
            <Link href="/sign-up"><Button>Join ElevateMe</Button></Link>
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="One ElevateMe profile" meta="Step 1">
          <p className="text-sm text-gray-600">Single persistent profile with a unique ElevateMe ID (e.g. EM-00100).</p>
        </Card>
        <Card title="Join approved programs" meta="Step 2">
          <p className="text-sm text-gray-600">Single events, continuous programmes, and special programmes — coordinator-confirmed.</p>
        </Card>
        <Card title="Get evaluated on ten criteria" meta="Step 3">
          <p className="text-sm text-gray-600">Preparation, Clarity, Confidence, Focus, Critical Analysis, Sound, Audience, Counter Arguments, Wit, Overall.</p>
        </Card>
      </div>

      <h2 className="em-section-title mb-3 mt-8">Approved programs and events</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {programs.map((p) => (
          <Card
            key={p.id}
            title={p.title}
            meta={`${p.institute} · ${p.venue} · ${p.startDate} → ${p.endDate}`}
            action={<Badge value={p.status} />}
          >
            <p className="text-sm text-gray-600">{p.description}</p>
            <p className="em-meta mt-2">
              {p.registered}/{p.capacity} registered · {p.category}
            </p>
            <div className="mt-3">
              <Link href={`/programs/${p.id}`}><Button variant="secondary">View details</Button></Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Badge } from "@/components/ui/Badge";

export default function StudentProfile() {
  return (
    <div>
      <PageHeader title="My Profile" description="Persistent ElevateMe profile. Scores and history are never edited here." />
      <Card title="Amaya Perera" meta="EM-00100 · Approved" action={<Badge value="Approved" />}>
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div><dt className="em-meta">Email</dt><dd>amaya@example.edu</dd></div>
          <div><dt className="em-meta">Institute</dt><dd>Colombo International College</dd></div>
          <div><dt className="em-meta">Date of birth</dt><dd>Private — staff verification only</dd></div>
          <div><dt className="em-meta">Phone</dt><dd>Private</dd></div>
        </dl>
      </Card>
    </div>
  );
}

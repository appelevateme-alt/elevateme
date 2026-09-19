import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Table } from "@/components/ui/Table";
import { mockSessions } from "@/lib/mock-data";

export default function CoordinatorSessions() {
  return (
    <div>
      <PageHeader title="Sessions / Committees" description="MUN committees, debate motions, continuous-program sessions." />
      <Card title="Sessions" meta={`${mockSessions.length} scheduled`}>
        <Table headers={["Session", "Topic", "Date", "Venue"]} rows={mockSessions.map((s) => [s.title, s.topic, s.date, s.venue])} />
      </Card>
    </div>
  );
}

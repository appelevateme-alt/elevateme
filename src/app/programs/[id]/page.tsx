import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow, SplitLayout } from "@/components/ui/Structure";
import { DefinitionList } from "@/components/ui/Data";
import { Table } from "@/components/ui/Table";
import { RegistrationPanel } from "@/components/domain/RegistrationPanel";
import { mockPrograms, mockSessions } from "@/lib/mock-data";

export default async function ProgramDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const program = mockPrograms.find((p) => p.id === id);
  if (!program) notFound();
  const sessions = mockSessions.filter((s) => s.programId === program.id);
  const closed = program.status === "RegistrationClosed";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <Eyebrow>Program details</Eyebrow>
      <PageHeader
        title={program.title}
        description={`${program.institute} · ${program.venue} · ${program.startDate} → ${program.endDate}`}
        action={<Badge value={program.status} />}
      />
      <SplitLayout
        main={
          <div className="flex flex-col gap-6">
            <section>
              <h2 className="em-section-title">About this program</h2>
              <p className="mt-1 text-sm text-gray-700">{program.description}</p>
              <div className="mt-3">
                <DefinitionList
                  items={[
                    ["Type", program.singleEventType ?? program.category],
                    ["Organizer", program.institute],
                    ["Eligibility", "Open to registered students; coordinator confirms every request."],
                    ["Availability", `${program.registered}/${program.capacity} registered`],
                  ]}
                />
              </div>
            </section>
            <section>
              <h2 className="em-section-title">Sessions, committees, and tracks</h2>
              {sessions.length === 0 ? (
                <p className="mt-1 text-sm text-gray-600">No sessions published yet.</p>
              ) : (
                <div className="mt-2">
                  <Table
                    headers={["Session", "Topic", "Date"]}
                    rows={sessions.map((s) => [s.title, s.topic, s.date])}
                  />
                </div>
              )}
            </section>
          </div>
        }
        aside={
          <div>
            <h2 className="em-section-title">Registration</h2>
            <div className="mt-2">
              <RegistrationPanel programTitle={program.title} sessions={sessions} closed={closed} />
            </div>
            <div className="mt-3">
              <Link href="/programs"><Button variant="ghost">Back to directory</Button></Link>
            </div>
            <Card title="After you join" meta="What happens next">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                <li>Request enters <strong>Pending</strong> state.</li>
                <li>Coordinator confirms, waitlists, or declines.</li>
                <li>Find the outcome under My Registrations.</li>
              </ol>
            </Card>
          </div>
        }
      />
    </div>
  );
}

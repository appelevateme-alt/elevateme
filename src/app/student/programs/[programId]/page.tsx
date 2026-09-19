import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow, SplitLayout } from "@/components/ui/Structure";
import { DefinitionList } from "@/components/ui/Data";
import { RegistrationPanel } from "@/components/domain/RegistrationPanel";
import { mockPrograms, mockRegistrations, mockSessions } from "@/lib/mock-data";

export default async function StudentProgramPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const program = mockPrograms.find((p) => p.id === programId);
  if (!program) notFound();
  const sessions = mockSessions.filter((s) => s.programId === program.id);
  const mine = mockRegistrations.find((r) => r.programId === program.id);

  return (
    <div>
      <Eyebrow>Program</Eyebrow>
      <PageHeader title={program.title} description={`${program.institute} · ${program.startDate} → ${program.endDate}`} action={<Badge value={program.status} />} />
      <SplitLayout
        main={
          <DefinitionList
            items={[
              ["Type", program.singleEventType ?? program.category],
              ["Venue", program.venue],
              ["Availability", `${program.registered}/${program.capacity} registered`],
              ["Description", program.description],
              ["My registration", mine ? `${mine.status} · ${mine.allocation}` : "Not registered"],
            ]}
          />
        }
        aside={<RegistrationPanel programTitle={program.title} sessions={sessions} closed={program.status === "RegistrationClosed"} />}
      />
    </div>
  );
}

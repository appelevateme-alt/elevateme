import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { Alert } from "@/components/ui/Feedback";
import { mockPrograms } from "@/lib/mock-data";

export default async function ProgramEditPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const program = mockPrograms.find((p) => p.id === programId) ?? mockPrograms[0];
  const editable = program.status === "Draft" || program.status === "ChangesRequested";

  return (
    <div>
      <Eyebrow>Edit program</Eyebrow>
      <PageHeader title={program.title} description={`Status: ${program.status}`} />
      {editable ? (
        <Card title="Edit fields" meta="Mock form — full field editing lands with the backend">
          <p className="text-sm text-gray-600">Draft editing for {program.title}. Use the builder for new programs.</p>
          <div className="mt-3"><Button>Save changes</Button></div>
        </Card>
      ) : (
        <Alert tone="warning" title="Editing restricted">
          {program.title} is <strong>{program.status}</strong>. After submission, editing is restricted according to
          lifecycle status — request changes through the admin queue or duplicate as a new draft.
          <div className="mt-2">
            <Link href={`/coordinator/programs/${program.id}`}><Button variant="secondary">Back to workspace</Button></Link>
          </div>
        </Alert>
      )}
    </div>
  );
}

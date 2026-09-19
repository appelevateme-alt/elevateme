import { ProgramWorkspace } from "@/components/domain/ProgramWorkspace";

export default async function ProgramStudentsPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  return <ProgramWorkspace programId={programId} active="Students" />;
}

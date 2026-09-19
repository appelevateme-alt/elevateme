import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Page";

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        title="About ElevateMe"
        description="A Diplomatic Impact student-growth platform. Coordinators run programs, evaluators score ten criteria, students and parents see progress and recommendations."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="How it works" meta="Four workflows">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>Coordinator creates a draft → admin approves → published.</li>
            <li>Student joins → coordinator confirms or waitlists.</li>
            <li>Evaluator scores ten criteria → admin releases results.</li>
            <li>Admin sends recommendations → student and parent notified.</li>
          </ol>
        </Card>
        <Card title="Design principles" meta="Plan §8">
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            <li>Flat surfaces, thin borders, one restrained accent color.</li>
            <li>Tables for staff data; simple cards for student content.</li>
            <li>One obvious primary action per page; explicit empty states.</li>
            <li>Deterministic insights first — no invented scores.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

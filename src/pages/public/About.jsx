import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';

export default function About() {
  return (
    <div className="container">
      <PageHeader
        title="About ElevateMe"
        description="A Diplomatic Impact student-growth platform. Coordinators run programs, evaluators score ten criteria, students and parents see progress and recommendations."
      />
      <div className="grid-2">
        <Card title="How it works" meta="Four workflows">
          <ol className="list-plain">
            <li>Coordinator creates a draft → admin approves → published.</li>
            <li>Student joins → coordinator confirms or waitlists.</li>
            <li>Evaluator scores ten criteria → admin releases results.</li>
            <li>Admin sends recommendations → student and parent notified.</li>
          </ol>
        </Card>
        <Card title="Design principles" meta="Flat editorial UI">
          <ul className="list-plain">
            <li>Flat surfaces, thin borders, one restrained accent color.</li>
            <li>Tables for staff data; simple rows for student content.</li>
            <li>One obvious primary action per page; explicit empty states.</li>
            <li>Deterministic insights first — no invented scores.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

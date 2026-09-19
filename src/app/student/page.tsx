import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader, EmptyState } from "@/components/ui/Page";
import { Eyebrow, ContentSection } from "@/components/ui/Structure";
import { AnnouncementItem } from "@/components/domain/Domain";
import { mockAnnouncements, mockEvaluations, mockRecommendations, mockRegistrations } from "@/lib/mock-data";

// Student dashboard (§10.3): vertically ordered overview, no decorative metric grid.
export default function StudentDashboard() {
  const next = mockRegistrations.find((r) => r.status === "Confirmed" || r.status === "Attended");
  const latest = mockEvaluations.find((e) => e.released);

  return (
    <div>
      <Eyebrow>Home</Eyebrow>
      <PageHeader
        title="Good afternoon, Amaya"
        description="EM-00100 · Colombo International College · profile Approved"
        action={<Link href="/student/programs"><Button>Find programs</Button></Link>}
      />
      <ContentSection>
        <h2 className="em-section-title">Next registered event</h2>
        {next ? (
          <p className="mt-1 text-sm text-gray-700">
            <strong>{next.programId === "p-mun" ? "MUN Colombo 2026" : "Speaking Cohort A"}</strong> · {next.allocation} · <Badge value={next.status} />{" "}
            <Link href="/student/registrations" className="font-semibold text-[#1d4ed8]">View registration →</Link>
          </p>
        ) : (
          <EmptyState title="No upcoming events" body="Browse approved programs to register." action={<Link href="/student/programs"><Button variant="secondary">Browse programs</Button></Link>} />
        )}
      </ContentSection>
      <ContentSection>
        <h2 className="em-section-title">Latest released result</h2>
        {latest ? (
          <p className="mt-1 text-sm text-gray-700">
            <strong>{latest.session}</strong> · {latest.scores.length} criteria ·{" "}
            <Link href={`/student/performance/${latest.id}`} className="font-semibold text-[#1d4ed8]">Open evaluation →</Link>
          </p>
        ) : (
          <EmptyState title="No released results yet" body="Results appear after admin release." />
        )}
      </ContentSection>
      <ContentSection>
        <h2 className="em-section-title">Current recommendations</h2>
        <p className="mt-1 text-sm text-gray-700">
          <strong>{mockRecommendations[0].title}</strong> — {mockRecommendations[0].action}{" "}
          <Link href="/student/recommendations" className="font-semibold text-[#1d4ed8]">View all →</Link>
        </p>
      </ContentSection>
      <ContentSection>
        <h2 className="em-section-title">Recent announcements</h2>
        <div className="mt-1">
          {mockAnnouncements.map((a) => (
            <AnnouncementItem key={a.id} title={a.title} meta={`${a.sender} · ${a.date} · ${a.audience}`} body={a.body} />
          ))}
        </div>
      </ContentSection>
    </div>
  );
}

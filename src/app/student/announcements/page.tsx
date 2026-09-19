import { PageHeader } from "@/components/ui/Page";
import { Eyebrow } from "@/components/ui/Structure";
import { AnnouncementItem } from "@/components/domain/Domain";
import { mockAnnouncements } from "@/lib/mock-data";

export default function StudentAnnouncements() {
  return (
    <div>
      <Eyebrow>Updates</Eyebrow>
      <PageHeader title="Announcements" description="Chronological flat feed. Pinned items first, then by date. Read/unread is subtle." />
      <div className="border-t border-gray-200">
        {mockAnnouncements.map((a) => (
          <AnnouncementItem key={a.id} title={a.title} meta={`${a.sender} · ${a.audience} · ${a.date}`} body={a.body} />
        ))}
      </div>
    </div>
  );
}

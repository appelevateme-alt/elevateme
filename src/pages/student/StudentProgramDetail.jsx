import { useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Eyebrow, SplitLayout } from '../../components/ui/Structure.jsx';
import { DefinitionList } from '../../components/ui/Data.jsx';
import { RegistrationPanel } from '../../components/domain/RegistrationPanel.jsx';
import { mockPrograms, mockRegistrations, mockSessions } from '../../lib/mock-data.js';
import NotFound from '../public/NotFound.jsx';

export function StudentProgramDetail() {
  const { programId } = useParams();
  const program = mockPrograms.find((p) => p.id === programId);
  if (!program) return <NotFound />;
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
              ['Type', program.singleEventType || program.category],
              ['Venue', program.venue],
              ['Availability', `${program.registered}/${program.capacity} registered`],
              ['Description', program.description],
              ['My registration', mine ? `${mine.status} · ${mine.allocation}` : 'Not registered'],
            ]}
          />
        }
        aside={<RegistrationPanel programTitle={program.title} sessions={sessions} closed={program.status === 'RegistrationClosed'} />}
      />
    </div>
  );
}

import PageHeader from '@/components/layout/PageHeader';
import MatchingArena from '@/components/matching/MatchingArena';

export default function MatchingArenaPage() {
  return (
    <>
      <PageHeader title="זירת התאמות" />
      <div className="page-content">
        <MatchingArena />
      </div>
    </>
  );
}

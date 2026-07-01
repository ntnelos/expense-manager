import PageHeader from '@/components/layout/PageHeader';

export default function MatchingArenaPage() {
  return (
    <>
      <PageHeader title="Matching Arena" />
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">🏟️</div>
          <div className="empty-state-title">Matching Arena</div>
          <div className="empty-state-text">
            The split-screen matching arena will be built in Milestone 4.
            Match unmatched invoices with expense lines side-by-side.
          </div>
        </div>
      </div>
    </>
  );
}

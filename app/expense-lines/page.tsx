import PageHeader from '@/components/layout/PageHeader';
import Link from 'next/link';

export default function ExpenseLinesPage() {
  return (
    <>
      <PageHeader title="Expense Lines">
        <Link href="/import" className="btn btn-primary">
          📥 Import Bank Data
        </Link>
      </PageHeader>
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">🏦</div>
          <div className="empty-state-title">Expense Lines Grid</div>
          <div className="empty-state-text">
            The expense lines grid with filtering and approval actions will be built in Milestone 3.
            Import a bank CSV/Excel file to see transactions here.
          </div>
          <Link href="/import" className="btn btn-primary" style={{ marginTop: 'var(--space-6)' }}>
            📥 Import Your First File
          </Link>
        </div>
      </div>
    </>
  );
}

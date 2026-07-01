import PageHeader from '@/components/layout/PageHeader';

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import Bank Data" />
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">📥</div>
          <div className="empty-state-title">Bank Data Import</div>
          <div className="empty-state-text">
            The CSV/Excel import with interactive column mapping will be built in Milestone 3.
            Upload bank exports and map columns to the unified schema.
          </div>
        </div>
      </div>
    </>
  );
}

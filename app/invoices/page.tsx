import PageHeader from '@/components/layout/PageHeader';
import Link from 'next/link';

export default function InvoicesPage() {
  return (
    <>
      <PageHeader title="Invoices">
        <Link href="/invoices/upload" className="btn btn-primary">
          📤 Upload Invoice
        </Link>
      </PageHeader>
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">🧾</div>
          <div className="empty-state-title">Invoice Grid</div>
          <div className="empty-state-text">
            The invoice management grid will be built in Milestone 2.
            Upload invoices to see them listed here with OCR data, filters, and inline editing.
          </div>
          <Link href="/invoices/upload" className="btn btn-primary" style={{ marginTop: 'var(--space-6)' }}>
            📤 Upload Your First Invoice
          </Link>
        </div>
      </div>
    </>
  );
}

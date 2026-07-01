import PageHeader from '@/components/layout/PageHeader';
import InvoiceGrid from '@/components/invoices/InvoiceGrid';
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
        <InvoiceGrid />
      </div>
    </>
  );
}

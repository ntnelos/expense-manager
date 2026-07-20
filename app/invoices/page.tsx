import PageHeader from '@/components/layout/PageHeader';
import InvoiceGrid from '@/components/invoices/InvoiceGrid';
import Link from 'next/link';
import DownloadInvoicesModal from '@/components/invoices/DownloadInvoicesModal';

export default function InvoicesPage() {
  return (
    <>
      <PageHeader title="חשבוניות">
        <DownloadInvoicesModal />
        <Link href="/invoices/upload" className="btn btn-primary">
          📤 העלאת חשבונית
        </Link>
      </PageHeader>
      
      <div className="page-content">
        <InvoiceGrid />
      </div>
    </>
  );
}

import PageHeader from '@/components/layout/PageHeader';
import InvoiceGrid from '@/components/invoices/InvoiceGrid';
import Link from 'next/link';
import SendToAccountantModal from '@/components/invoices/SendToAccountantModal';

export default function InvoicesPage() {
  return (
    <>
      <PageHeader title="חשבוניות">
        <SendToAccountantModal />
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

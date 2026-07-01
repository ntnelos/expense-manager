'use client';

import PageHeader from '@/components/layout/PageHeader';
import FileUploader from '@/components/invoices/FileUploader';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function InvoiceUploadPage() {
  const router = useRouter();

  const handleUploadSuccess = () => {
    // Redirect to invoices grid page after successful processing
    router.push('/invoices');
  };

  return (
    <>
      <PageHeader title="Upload Invoice">
        <Link href="/invoices" className="btn btn-secondary">
          🧾 Back to Invoices
        </Link>
      </PageHeader>

      <div className="page-content" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
            Upload Supplier Document
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Upload a PDF or an Image file (JPEG, PNG, WebP) of a receipt or invoice. 
            The system will automatically prevent duplicates, upload it to your Google Drive, 
            and extract all metadata using OpenAI Vision.
          </p>
        </div>

        <FileUploader onUploadSuccess={handleUploadSuccess} source="manual_upload" />
      </div>
    </>
  );
}

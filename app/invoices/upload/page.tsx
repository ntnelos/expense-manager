import PageHeader from '@/components/layout/PageHeader';

export default function InvoiceUploadPage() {
  return (
    <>
      <PageHeader title="Upload Invoice" />
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">📤</div>
          <div className="empty-state-title">Invoice Upload</div>
          <div className="empty-state-text">
            The drag-and-drop upload with OCR extraction will be built in Milestone 2.
          </div>
        </div>
      </div>
    </>
  );
}

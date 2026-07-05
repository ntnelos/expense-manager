'use client';

import PageHeader from '@/components/layout/PageHeader';
import FileUploader from '@/components/invoices/FileUploader';
import Link from 'next/link';
import { useState } from 'react';

export default function InvoiceUploadPage() {
  const [uploadCount, setUploadCount] = useState(0);

  const handleUploadSuccess = () => {
    setUploadCount((prev) => prev + 1);
  };

  return (
    <>
      <PageHeader title="העלאת חשבוניות">
        <Link href="/invoices" className="btn btn-secondary">
          🧾 חזרה לחשבוניות
          {uploadCount > 0 && (
            <span style={{
              marginRight: 'var(--space-2)',
              background: 'var(--color-accent)',
              color: 'white',
              borderRadius: 'var(--radius-full)',
              padding: '2px 8px',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
            }}>
              {uploadCount} חדשות
            </span>
          )}
        </Link>
      </PageHeader>

      <div className="page-content" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
            העלאת מסמכי ספק
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            גרור והשלך קבצי PDF או תמונות (JPEG, PNG, WebP) — ניתן להעלות מספר קבצים בו-זמנית.
            המערכת תמנע כפילויות באופן אוטומטי, תעלה את הקבצים ל-Google Drive,
            תפענח את הנתונים באמצעות Gemini Vision, ותשייך קטגוריה אוטומטית.
          </p>
        </div>

        <FileUploader onUploadSuccess={handleUploadSuccess} source="manual_upload" />
      </div>
    </>
  );
}

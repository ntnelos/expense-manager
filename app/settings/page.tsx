'use client';

import PageHeader from '@/components/layout/PageHeader';
import CategoryManager from '@/components/settings/CategoryManager';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="הגדרות" />
      <div className="page-content" style={{ maxWidth: '800px' }}>
        <CategoryManager />
      </div>
    </>
  );
}

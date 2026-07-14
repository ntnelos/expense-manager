'use client';

import PageHeader from '@/components/layout/PageHeader';
import CategoryManager from '@/components/settings/CategoryManager';
import IgnoredExpensesManager from '@/components/settings/IgnoredExpensesManager';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="הגדרות" />
      <div className="page-content" style={{ maxWidth: '800px' }}>
        <CategoryManager />
        <IgnoredExpensesManager />
      </div>
    </>
  );
}

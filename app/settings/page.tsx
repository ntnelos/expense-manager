'use client';

import PageHeader from '@/components/layout/PageHeader';
import CategoryManager from '@/components/settings/CategoryManager';
import IgnoredExpensesManager from '@/components/settings/IgnoredExpensesManager';
import GmailSyncManager from '@/components/settings/GmailSyncManager';
import SupplierAliasManager from '@/components/settings/SupplierAliasManager';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="הגדרות" />
      <div className="page-content max-w-[1200px] mx-auto">
        <GmailSyncManager />
        <SupplierAliasManager />
        <CategoryManager />
        <IgnoredExpensesManager />
      </div>
    </>
  );
}

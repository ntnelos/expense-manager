import PageHeader from '@/components/layout/PageHeader';
import Link from 'next/link';
import ExpenseLineGrid from '@/components/expense-lines/ExpenseLineGrid';

export default function ExpenseLinesPage() {
  return (
    <>
      <PageHeader title="שורות הוצאה">
        <a href="/api/export" className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
          📊 ייצוא לרואה חשבון
        </a>
        <Link href="/import" className="btn btn-primary">
          📥 ייבוא נתוני בנק
        </Link>
      </PageHeader>
      <div className="page-content">
        <ExpenseLineGrid />
      </div>
    </>
  );
}

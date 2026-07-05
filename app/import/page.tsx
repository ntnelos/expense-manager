import PageHeader from '@/components/layout/PageHeader';
import CsvImporter from '@/components/import/CsvImporter';

export default function ImportPage() {
  return (
    <>
      <PageHeader title="ייבוא נתוני בנק" />
      <div className="page-content" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <CsvImporter />
      </div>
    </>
  );
}

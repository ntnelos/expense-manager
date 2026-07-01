import PageHeader from '@/components/layout/PageHeader';

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">⚙️</div>
          <div className="empty-state-title">Settings</div>
          <div className="empty-state-text">
            System settings including email configuration, Telegram bot management,
            and column mapping presets will be available here.
          </div>
        </div>
      </div>
    </>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

const mainNav: NavItem[] = [
  { label: 'לוח בקרה', href: '/', icon: '📊' },
  { label: 'חשבוניות', href: '/invoices', icon: '🧾' },
  { label: 'שורות הוצאה', href: '/expense-lines', icon: '🏦' },
  { label: 'זירת התאמות', href: '/matching', icon: '🏟️' },
];

const toolsNav: NavItem[] = [
  { label: 'ייבוא נתוני בנק', href: '/import', icon: '📥' },
  { label: 'העלאת חשבונית', href: '/invoices/upload', icon: '📤' },
];

const settingsNav: NavItem[] = [
  { label: 'הגדרות', href: '/settings', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  if (pathname === '/login') {
    return null;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">EM</div>
        <div>
          <div className="sidebar-title">מנהל הוצאות</div>
          <div className="sidebar-subtitle">בקרת חשבוניות</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">ראשי</div>
        {mainNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="sidebar-link-badge">{item.badge}</span>
            )}
          </Link>
        ))}

        <div className="sidebar-section-label">כלים</div>
        {toolsNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        <div className="sidebar-section-label">System</div>
        {settingsNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <LogoutButton />
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
          v0.1.0 • MVP
        </div>
      </div>
    </aside>
  );
}

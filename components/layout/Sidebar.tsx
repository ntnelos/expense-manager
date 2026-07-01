'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

const mainNav: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: '📊' },
  { label: 'Invoices', href: '/invoices', icon: '🧾' },
  { label: 'Expense Lines', href: '/expense-lines', icon: '🏦' },
  { label: 'Matching Arena', href: '/matching', icon: '🏟️' },
];

const toolsNav: NavItem[] = [
  { label: 'Import Bank Data', href: '/import', icon: '📥' },
  { label: 'Upload Invoice', href: '/invoices/upload', icon: '📤' },
];

const settingsNav: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">EM</div>
        <div>
          <div className="sidebar-title">Expense Manager</div>
          <div className="sidebar-subtitle">Invoice Control</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Main</div>
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

        <div className="sidebar-section-label">Tools</div>
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
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          v0.1.0 • MVP
        </div>
      </div>
    </aside>
  );
}

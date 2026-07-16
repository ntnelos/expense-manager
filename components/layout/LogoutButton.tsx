'use client';

import { logout } from '@/app/login/actions';

export default function LogoutButton() {
  return (
    <form action={logout} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
      <button 
        type="submit" 
        className="sidebar-link"
        style={{ 
          background: 'none', 
          border: 'none', 
          width: '100%', 
          textAlign: 'right', 
          cursor: 'pointer',
          color: 'var(--color-warning)'
        }}
      >
        <span className="sidebar-link-icon">🚪</span>
        <span>התנתק</span>
      </button>
    </form>
  );
}

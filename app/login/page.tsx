'use client';

import { useActionState, useEffect } from 'react';
import { login } from './actions';
import { useFormStatus } from 'react-dom';

function LoginButton() {
  const { pending } = useFormStatus();

  return (
    <button 
      type="submit" 
      disabled={pending}
      className="btn btn-primary"
      style={{ width: '100%', marginTop: 'var(--space-4)' }}
    >
      {pending ? 'מתחבר...' : 'התחבר'}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(login, null);

  useEffect(() => {
    // We add a minimal global style just for the login page background 
    // to ensure it takes up the full viewport nicely without sidebars
    document.body.style.display = 'flex';
    document.body.style.alignItems = 'center';
    document.body.style.justifyContent = 'center';
    document.body.style.minHeight = '100vh';
    
    return () => {
      document.body.style.display = '';
      document.body.style.alignItems = '';
      document.body.style.justifyContent = '';
      document.body.style.minHeight = '';
    };
  }, []);

  return (
    <div style={{
      width: '100%',
      maxWidth: '400px',
      padding: 'var(--space-8)',
      background: 'var(--color-glass-bg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid var(--color-glass-border)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-xl)',
      textAlign: 'center'
    }}>
      <div style={{ 
        width: '60px', 
        height: '60px', 
        background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
        borderRadius: 'var(--radius-lg)',
        margin: '0 auto var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px'
      }}>
        💰
      </div>
      
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
        ברוך הבא
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
        אנא התחבר כדי לגשת למערכת ניהול ההוצאות
      </p>

      <form action={formAction} style={{ textAlign: 'right' }}>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label htmlFor="email" style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            כתובת אימייל
          </label>
          <input 
            type="email" 
            id="email" 
            name="email" 
            className="input" 
            required 
            placeholder="name@example.com"
            dir="ltr"
            style={{ width: '100%', textAlign: 'left' }}
          />
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label htmlFor="password" style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            סיסמה
          </label>
          <input 
            type="password" 
            id="password" 
            name="password" 
            className="input" 
            required 
            placeholder="••••••••"
            dir="ltr"
            style={{ width: '100%', textAlign: 'left' }}
          />
        </div>

        {state?.error && (
          <div style={{ 
            color: 'var(--color-warning)', 
            background: 'var(--color-warning-muted)', 
            padding: 'var(--space-2)', 
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-sm)',
            textAlign: 'center',
            marginBottom: 'var(--space-4)'
          }}>
            {state.error}
          </div>
        )}

        <LoginButton />
      </form>
    </div>
  );
}

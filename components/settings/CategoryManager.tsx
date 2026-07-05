'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

const ICON_OPTIONS = ['📁', '⛽', '🍔', '☁️', '🖨️', '✈️', '👔', '📱', '🛡️', '🏢', '🚗', '💡', '🔧', '📦', '🏠', '💻', '🎓', '⚕️', '🏗️', '🧹'];

const COLOR_OPTIONS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#ec4899', '#f43f5e', '#6b7280',
];

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📁');
  const [newColor, setNewColor] = useState('#6366f1');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), icon: newIcon, color: newColor }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'שגיאה ביצירת קטגוריה.');
        return;
      }

      setCategories((prev) => [...prev, data.category]);
      setNewName('');
      setNewIcon('📁');
      setNewColor('#6366f1');
      setShowIconPicker(false);
      setShowColorPicker(false);
    } catch (err: any) {
      setError(err.message || 'שגיאה בלתי צפויה.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'שגיאה במחיקת קטגוריה.');
        return;
      }

      setCategories((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirm(null);
    } catch (err: any) {
      setError(err.message || 'שגיאה בלתי צפויה.');
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
        🏷️ ניהול קטגוריות
      </h3>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)' }}>
        הגדר קטגוריות לסיווג חשבוניות. הקטגוריות ישמשו גם לשיוך אוטומטי ע&quot;י מנוע ה-AI.
      </p>

      {error && (
        <div
          style={{
            background: 'var(--color-error-muted)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ color: 'var(--color-error)', fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* Add Category Form */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'flex-start',
          marginBottom: 'var(--space-5)',
          flexWrap: 'wrap',
        }}
      >
        {/* Icon Picker */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-secondary"
            onClick={() => { setShowIconPicker(!showIconPicker); setShowColorPicker(false); }}
            style={{ fontSize: '1.3rem', padding: 'var(--space-2) var(--space-3)' }}
            title="בחר אייקון"
          >
            {newIcon}
          </button>
          {showIconPicker && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 'var(--space-2)',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-glass-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3)',
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 'var(--space-1)',
                zIndex: 100,
                boxShadow: 'var(--shadow-xl)',
                minWidth: '200px',
              }}
            >
              {ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => { setNewIcon(icon); setShowIconPicker(false); }}
                  style={{
                    fontSize: '1.3rem',
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    background: newIcon === icon ? 'var(--color-accent-subtle)' : 'transparent',
                    border: newIcon === icon ? '1px solid var(--color-accent)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'background var(--transition-fast)',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Color Picker */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-secondary"
            onClick={() => { setShowColorPicker(!showColorPicker); setShowIconPicker(false); }}
            style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            title="בחר צבע"
          >
            <div style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-sm)', background: newColor }} />
          </button>
          {showColorPicker && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 'var(--space-2)',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-glass-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3)',
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 'var(--space-1)',
                zIndex: 100,
                boxShadow: 'var(--shadow-xl)',
                minWidth: '200px',
              }}
            >
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  onClick={() => { setNewColor(color); setShowColorPicker(false); }}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    background: color,
                    border: newColor === color ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                    outline: newColor === color ? `2px solid ${color}` : 'none',
                    outlineOffset: '1px',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Name Input */}
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="שם הקטגוריה החדשה..."
          style={{ flex: 1, minWidth: '180px' }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />

        <button
          className="btn btn-primary btn-sm"
          onClick={handleAdd}
          disabled={saving || !newName.trim()}
          style={{ whiteSpace: 'nowrap' }}
        >
          {saving ? 'שומר...' : '+ הוסף קטגוריה'}
        </button>
      </div>

      {/* Categories List */}
      <div className="data-table-container">
        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '44px', marginBottom: 'var(--space-2)' }} />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-icon">🏷️</div>
            <div className="empty-state-title">אין קטגוריות</div>
            <div className="empty-state-text">הוסף קטגוריה ראשונה למעלה.</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>אייקון</th>
                <th>שם הקטגוריה</th>
                <th>צבע</th>
                <th style={{ textAlign: 'start' }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td style={{ fontSize: '1.3rem', width: '50px', textAlign: 'center' }}>{cat.icon}</td>
                  <td style={{ fontWeight: 600 }}>{cat.name}</td>
                  <td>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: 'var(--radius-sm)',
                      background: cat.color,
                    }} />
                  </td>
                  <td style={{ textAlign: 'start' }}>
                    {deleteConfirm === cat.id ? (
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>למחוק?</span>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDelete(cat.id)}
                          style={{ color: 'var(--color-error)', fontWeight: 700 }}
                        >
                          כן
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDeleteConfirm(null)}
                        >
                          לא
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => setDeleteConfirm(cat.id)}
                        title="מחק קטגוריה"
                      >
                        🗑️
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

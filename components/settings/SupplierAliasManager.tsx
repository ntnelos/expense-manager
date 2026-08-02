'use client';

import React, { useState, useEffect } from 'react';
import { SupplierAlias } from '@/lib/supabase/types';

export default function SupplierAliasManager() {
  const [aliases, setAliases] = useState<SupplierAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New item state
  const [originalName, setOriginalName] = useState('');
  const [aliasName, setAliasName] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit & Delete state (matching CategoryManager)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOriginalName, setEditOriginalName] = useState('');
  const [editAliasName, setEditAliasName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchAliases = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/aliases');
      if (!res.ok) throw new Error('טעינת כינויים נכשלה');
      const data = await res.json();
      setAliases(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'שגיאה בטעינת כינויים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAliases();
  }, []);

  const handleAddAlias = async () => {
    if (!originalName.trim() || !aliasName.trim()) return;

    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/settings/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_name: originalName.trim(),
          alias_name: aliasName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'שגיאה בהוספת כינוי');
      }

      setAliases((prev) => [data, ...prev]);
      setOriginalName('');
      setAliasName('');
    } catch (err: any) {
      setError(err.message || 'שגיאה בלתי צפויה');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (alias: SupplierAlias) => {
    setEditingId(alias.id);
    setEditOriginalName(alias.original_name);
    setEditAliasName(alias.alias_name);
    setDeleteConfirm(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editAliasName.trim() || !editOriginalName.trim()) return;

    try {
      setSaving(true);
      setError(null);

      const res = await fetch('/api/settings/aliases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          original_name: editOriginalName.trim(),
          alias_name: editAliasName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'שגיאה בעדכון כינוי');
      }

      setAliases((prev) =>
        prev.map((a) => (a.id === editingId ? data : a))
      );
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'שגיאה בלתי צפויה');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/settings/aliases?id=${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'שגיאה במחיקת כינוי');
      }

      setAliases((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirm(null);
    } catch (err: any) {
      setError(err.message || 'שגיאה בלתי צפויה');
    }
  };

  return (
    <div style={{ marginBottom: 'var(--space-8)' }}>
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
        🔄 ניהול כינויים לספקים (Aliases)
      </h3>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)' }}>
        הגדר שמות חלופיים לספקים כדי לאחד ולהמיר שמות זיהוי מקוריים לשם אחיד במערכת (למשל "דרך ארץ" ➔ "כביש 6").
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
          <button onClick={() => setError(null)} style={{ color: 'var(--color-error)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Add Alias Form Bar */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'center',
          marginBottom: 'var(--space-5)',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={originalName}
          onChange={(e) => setOriginalName(e.target.value)}
          placeholder="שם מקורי בחשבונית (למשל: דרך ארץ)..."
          style={{ flex: 1, minWidth: '180px' }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddAlias(); }}
        />

        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>➔</span>

        <input
          type="text"
          value={aliasName}
          onChange={(e) => setAliasName(e.target.value)}
          placeholder="כינוי במערכת (למשל: כביש 6)..."
          style={{ flex: 1, minWidth: '180px' }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddAlias(); }}
        />

        <button
          className="btn btn-primary btn-sm"
          onClick={handleAddAlias}
          disabled={saving || !originalName.trim() || !aliasName.trim()}
          style={{ whiteSpace: 'nowrap' }}
        >
          {saving ? 'שומר...' : '+ הוסף כינוי'}
        </button>
      </div>

      {/* Aliases Table Container */}
      <div className="data-table-container">
        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '44px', marginBottom: 'var(--space-2)' }} />
            ))}
          </div>
        ) : aliases.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-icon">🔄</div>
            <div className="empty-state-title">אין כינויים מוגדרים</div>
            <div className="empty-state-text">הוסף כינוי ראשון למעלה.</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>שם מקורי בחשבונית</th>
                <th>כינוי מבוקש במערכת</th>
                <th style={{ textAlign: 'start' }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((alias) => (
                <tr key={alias.id}>
                  {editingId === alias.id ? (
                    <>
                      <td>
                        <input
                          type="text"
                          value={editOriginalName}
                          onChange={(e) => setEditOriginalName(e.target.value)}
                          className="input btn-sm"
                          style={{ width: '100%' }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={editAliasName}
                          onChange={(e) => setEditAliasName(e.target.value)}
                          className="input btn-sm"
                          style={{ width: '100%' }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); }}
                        />
                      </td>
                      <td style={{ textAlign: 'start' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={handleSaveEdit}
                            disabled={saving}
                          >
                            שמור
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditingId(null)}
                            disabled={saving}
                          >
                            ביטול
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontWeight: 600 }}>{alias.original_name}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: 'var(--space-1) var(--space-3)',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--color-accent-subtle)',
                            color: 'var(--color-accent)',
                            fontWeight: 600,
                            fontSize: 'var(--font-size-xs)',
                          }}
                        >
                          {alias.alias_name}
                        </span>
                      </td>
                      <td style={{ textAlign: 'start' }}>
                        {deleteConfirm === alias.id ? (
                          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)' }}>למחוק?</span>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleDelete(alias.id)}
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
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              className="btn btn-ghost btn-icon"
                              onClick={() => startEditing(alias)}
                              title="ערוך כינוי"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn btn-ghost btn-icon"
                              onClick={() => setDeleteConfirm(alias.id)}
                              title="מחק כינוי"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

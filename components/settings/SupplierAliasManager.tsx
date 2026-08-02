'use client';

import React, { useState, useEffect } from 'react';
import { SupplierAlias } from '@/lib/supabase/types';

export default function SupplierAliasManager() {
  const [aliases, setAliases] = useState<SupplierAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [originalName, setOriginalName] = useState('');
  const [aliasName, setAliasName] = useState('');
  const [saving, setSaving] = useState(false);

  // Inline editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAliasName, setEditAliasName] = useState('');
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  useEffect(() => {
    fetchAliases();
  }, []);

  const fetchAliases = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/aliases');
      if (!res.ok) throw new Error('נכשל בטעינת הכינויים');
      const data = await res.json();
      setAliases(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!originalName || !aliasName) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);
      const res = await fetch('/api/settings/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_name: originalName, alias_name: aliasName }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'שגיאה בהוספת כינוי');
      }

      const newAlias = await res.json();
      setAliases([newAlias, ...aliases]);
      setOriginalName('');
      setAliasName('');
      setSuccessMsg('הכינוי נוסף בהצלחה!');
      setShowAddForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (alias: SupplierAlias) => {
    setEditingId(alias.id);
    setEditAliasName(alias.alias_name);
    setError(null);
    setSuccessMsg(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditAliasName('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editAliasName.trim()) return;

    try {
      setSavingEditId(id);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch('/api/settings/aliases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, alias_name: editAliasName.trim() }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'שגיאה בעדכון הכינוי');
      }

      const updated = await res.json();
      setAliases(aliases.map((a) => (a.id === id ? { ...a, alias_name: updated.alias_name } : a)));
      setEditingId(null);
      setEditAliasName('');
      setSuccessMsg('הכינוי עודכן בהצלחה!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDeleteAlias = async (id: string, originalName: string) => {
    if (!confirm(`האם למחוק את הכינוי עבור "${originalName}"?`)) return;

    try {
      setError(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/settings/aliases?id=${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('שגיאה במחיקת הכינוי');

      setAliases(aliases.filter((a) => a.id !== id));
      setSuccessMsg('הכינוי נמחק בהצלחה');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="bg-white rounded-lg shadow border border-gray-100 p-6 mb-8 text-center text-gray-500">טוען כינויים...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
      {/* Header with prominent Add button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">ניהול כינויים לספקים (Aliases)</h2>
          <p className="text-sm text-gray-500 mt-1">
            הגדר והערוך שמות מומלצים לספקים כדי לאחד זיהויי חשבוניות תחת שם אחיד.
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setError(null);
            setSuccessMsg(null);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 whitespace-nowrap"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>{showAddForm ? 'סגור טופס' : 'הוסף כינוי חדש'}</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3.5 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3.5 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-green-500 hover:text-green-700 font-bold">&times;</button>
        </div>
      )}

      {/* Prominent Add Form Container */}
      {showAddForm && (
        <div className="mb-6 p-5 bg-blue-50/60 border border-blue-200 rounded-xl shadow-inner">
          <h3 className="text-md font-semibold text-blue-950 mb-3 flex items-center gap-2">
            <span>✨</span> הוספת כינוי חדש לספק
          </h3>
          <form onSubmit={handleAddAlias} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">שם מקורי בחשבונית (למשל: "דרך ארץ הייווייז")</label>
              <input
                type="text"
                value={originalName}
                onChange={(e) => setOriginalName(e.target.value)}
                placeholder="הזן שם מקורי שנמצא בחשבונית..."
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
            </div>
            <div className="hidden md:block text-gray-400 self-end pb-2 font-bold">➔</div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">כינוי מומר במערכת (למשל: "כביש 6")</label>
              <input
                type="text"
                value={aliasName}
                onChange={(e) => setAliasName(e.target.value)}
                placeholder="הזן את השם המבוקש במערכת..."
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
            </div>
            <div className="self-end mt-2 md:mt-0">
              <button
                type="submit"
                disabled={saving || !originalName || !aliasName}
                className="w-full md:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-semibold whitespace-nowrap shadow-sm"
              >
                {saving ? 'שומר...' : 'שמור כינוי'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Styled Structured Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <th className="py-3.5 px-4">שם מקורי בחשבונית</th>
              <th className="py-3.5 px-4">כינוי מומר במערכת</th>
              <th className="py-3.5 px-4 text-center w-36">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white text-sm">
            {aliases.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-8 text-gray-500 bg-gray-50/50">
                  לא הוגדרו כינויים לספקים. לחץ על <strong className="text-blue-600">"הוסף כינוי חדש"</strong> למעלה כדי להוסיף.
                </td>
              </tr>
            ) : (
              aliases.map((alias) => {
                const isEditing = editingId === alias.id;
                const isSavingThis = savingEditId === alias.id;

                return (
                  <tr key={alias.id} className="hover:bg-blue-50/30 transition-colors">
                    {/* Original Name */}
                    <td className="py-3.5 px-4 font-medium text-gray-900">
                      {alias.original_name}
                    </td>

                    {/* Converted Alias Name (Editable) */}
                    <td className="py-3.5 px-4">
                      {isEditing ? (
                        <div className="flex items-center gap-2 max-w-xs">
                          <input
                            type="text"
                            value={editAliasName}
                            onChange={(e) => setEditAliasName(e.target.value)}
                            className="w-full px-3 py-1.5 border border-blue-400 rounded-md focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(alias.id);
                              if (e.key === 'Escape') cancelEditing();
                            }}
                          />
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                          {alias.alias_name}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleSaveEdit(alias.id)}
                            disabled={isSavingThis}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-semibold disabled:opacity-50"
                          >
                            {isSavingThis ? 'שומר...' : 'שמור'}
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs font-semibold"
                          >
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => startEditing(alias)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ערוך כינוי"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteAlias(alias.id, alias.original_name)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="מחק כינוי"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

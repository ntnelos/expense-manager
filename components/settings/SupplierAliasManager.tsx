'use client';

import React, { useState, useEffect } from 'react';
import { SupplierAlias } from '@/lib/supabase/types';

export default function SupplierAliasManager() {
  const [aliases, setAliases] = useState<SupplierAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [originalName, setOriginalName] = useState('');
  const [aliasName, setAliasName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAliases();
  }, []);

  const fetchAliases = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/aliases');
      if (!res.ok) throw new Error('Failed to load aliases');
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
      const res = await fetch('/api/settings/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_name: originalName, alias_name: aliasName }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add alias');
      }

      const newAlias = await res.json();
      setAliases([newAlias, ...aliases]);
      setOriginalName('');
      setAliasName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAlias = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/aliases?id=${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete alias');
      
      setAliases(aliases.filter((a) => a.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-gray-500">טוען כינויים...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 p-6 mb-8">
      <h2 className="text-xl font-bold mb-4">ניהול כינויים לספקים (Aliases)</h2>
      <p className="text-sm text-gray-600 mb-6">
        הגדר שמות חלופיים לספקים כדי לזהות אותם בקלות. למשל, אם המערכת מזהה חשבונית של "דרך ארץ הייווייז", תוכל להגדיר כינוי "כביש 6".
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Add New Form */}
      <form onSubmit={handleAddAlias} className="flex items-center gap-3 mb-8">
        <input
          type="text"
          value={originalName}
          onChange={(e) => setOriginalName(e.target.value)}
          placeholder="שם מקורי (למשל: איי פאקט)"
          className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          required
        />
        <span className="text-gray-400">➡️</span>
        <input
          type="text"
          value={aliasName}
          onChange={(e) => setAliasName(e.target.value)}
          placeholder="כינוי מזהה (למשל: bizibox)"
          className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          required
        />
        <button
          type="submit"
          disabled={saving || !originalName || !aliasName}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium whitespace-nowrap"
        >
          {saving ? 'מוסיף...' : 'הוסף כינוי'}
        </button>
      </form>

      {/* List */}
      <div className="space-y-3">
        {aliases.length === 0 ? (
          <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            אין כינויים מוגדרים. הוסף כינוי חדש למעלה.
          </div>
        ) : (
          aliases.map((alias) => (
            <div
              key={alias.id}
              className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-700">{alias.original_name}</span>
                <span className="text-gray-400 text-sm">מומר ל-</span>
                <span className="font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full text-sm">
                  {alias.alias_name}
                </span>
              </div>
              <button
                onClick={() => handleDeleteAlias(alias.id)}
                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                title="מחק כינוי"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

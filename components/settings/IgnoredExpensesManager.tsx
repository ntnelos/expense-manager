'use client';

import { useState, useEffect } from 'react';

interface IgnoredRule {
  id: string;
  description_pattern: string;
  created_at: string;
}

export default function IgnoredExpensesManager() {
  const [rules, setRules] = useState<IgnoredRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/ignored-expenses');
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('האם לבטל את ההתעלמות מהוצאה זו?')) return;
    try {
      const res = await fetch(`/api/ignored-expenses?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRules(rules.filter(r => r.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="card animate-in" style={{ marginTop: 'var(--space-6)' }}>
      <div className="card-header">
        <h2 className="card-title">הוצאות שמוגדרות להתעלמות</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
          רשימת תיאורי ההוצאות שבחרת להתעלם מהן. הוצאות עם תיאור זה לא ייובאו למערכת.
        </p>
      </div>
      <div className="card-body">
        {loading ? (
          <div style={{ padding: 'var(--space-4)' }}>טוען נתונים...</div>
        ) : rules.length === 0 ? (
          <div style={{ padding: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
            אין הוצאות שמוגדרות להתעלמות.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>תיאור הוצאה מוגדר להתעלמות</th>
                <th>תאריך הוספה</th>
                <th style={{ width: '100px', textAlign: 'end' }}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={{ fontWeight: 600 }}>{rule.description_pattern}</td>
                  <td>{new Date(rule.created_at).toLocaleDateString('he-IL')}</td>
                  <td style={{ textAlign: 'end' }}>
                    <button className="btn btn-ghost btn-icon" title="בטל התעלמות" onClick={() => handleDelete(rule.id)}>
                      🗑️
                    </button>
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

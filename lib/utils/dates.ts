/**
 * Formats an ISO date string (YYYY-MM-DD) into a localized Hebrew/Israeli format (DD/MM/YYYY).
 */
export function formatToIsraeliDate(dateStr: string | Date | null): string {
  if (!dateStr) return '—';
  
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  
  // Check if valid date
  if (isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Returns the difference in days between two date objects or ISO strings.
 */
export function getDayDifference(dateA: string | Date, dateB: string | Date): number {
  const d1 = typeof dateA === 'string' ? new Date(dateA) : dateA;
  const d2 = typeof dateB === 'string' ? new Date(dateB) : dateB;

  // Set time components to midnight to compare days only
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);

  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Safely parses a string date into an ISO date string (YYYY-MM-DD).
 * Returns null if parsing fails.
 */
export function parseToISODate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) {
    // Try manual parsing of DD/MM/YYYY format
    const matches = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (matches) {
      const day = matches[1].padStart(2, '0');
      const month = matches[2].padStart(2, '0');
      const year = matches[3];
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  return new Date(parsed).toISOString().split('T')[0];
}

'use client';

import type { InvoiceStatus, ExpenseLineStatus } from '@/lib/supabase/types';

type StatusType = InvoiceStatus | ExpenseLineStatus;

const STATUS_CONFIG: Record<StatusType, { label: string; className: string }> = {
  new: { label: 'חדש', className: 'badge-new' },
  processing: { label: 'בעיבוד', className: 'badge-processing' },
  partially_matched: { label: 'חלקי', className: 'badge-partial' },
  fully_matched: { label: 'הותאם', className: 'badge-matched' },
  error: { label: 'שגיאה', className: 'badge-error' },
  approved: { label: 'אושר', className: 'badge-approved' },
  unapproved: { label: 'לא אושר', className: 'badge-unapproved' },
  approved_no_invoice: { label: 'ללא חשבונית', className: 'badge-no-invoice' },
  approved_no_expense: { label: 'ללא הוצאה', className: 'badge-no-invoice' },
};

interface StatusBadgeProps {
  status: StatusType;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, className: '' };

  return (
    <span className={`badge ${config.className}`}>
      <span className="badge-dot" />
      {config.label}
    </span>
  );
}

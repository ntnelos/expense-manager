'use client';

import type { InvoiceStatus, ExpenseLineStatus } from '@/lib/supabase/types';

type StatusType = InvoiceStatus | ExpenseLineStatus;

const STATUS_CONFIG: Record<StatusType, { label: string; className: string }> = {
  new: { label: 'New', className: 'badge-new' },
  processing: { label: 'Processing', className: 'badge-processing' },
  partially_matched: { label: 'Partial', className: 'badge-partial' },
  fully_matched: { label: 'Matched', className: 'badge-matched' },
  error: { label: 'Error', className: 'badge-error' },
  approved: { label: 'Approved', className: 'badge-approved' },
  unapproved: { label: 'Unapproved', className: 'badge-unapproved' },
  approved_no_invoice: { label: 'No Invoice', className: 'badge-no-invoice' },
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

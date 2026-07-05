'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { computeFileHash } from '@/lib/utils/client-hash';

interface FileUploaderProps {
  onUploadSuccess?: (invoice: any) => void;
  onAllComplete?: () => void;
  source?: 'manual_upload' | 'email' | 'telegram';
}

type FileItemStatus = 'queued' | 'hashing' | 'checking_dup' | 'uploading' | 'success' | 'error' | 'duplicate' | 'credit_note';

interface FileItem {
  id: string;
  file: File;
  status: FileItemStatus;
  message: string;
  invoice?: any;
}

const MAX_CONCURRENT = 2;

export default function FileUploader({ onUploadSuccess, onAllComplete, source = 'manual_upload' }: FileUploaderProps) {
  const [queue, setQueue] = useState<FileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addFilesToQueue(files);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFilesToQueue(Array.from(files));
    }
    // Reset input so the same files can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const addFilesToQueue = (files: File[]) => {
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const newItems: FileItem[] = files
      .filter((f) => validTypes.includes(f.type))
      .map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'queued' as FileItemStatus,
        message: 'ממתין בתור...',
      }));

    const invalidCount = files.length - newItems.length;

    if (invalidCount > 0 && newItems.length === 0) {
      // All files invalid
      setQueue([{
        id: `error-${Date.now()}`,
        file: files[0],
        status: 'error',
        message: `${invalidCount} קבצים לא תקינים. אנא העלה קבצי PDF או תמונות (JPEG, PNG, WebP).`,
      }]);
      return;
    }

    setQueue((prev) => [...prev, ...newItems]);

    // Start processing if not already running
    if (!processingRef.current) {
      setTimeout(() => processQueue([...queue, ...newItems]), 50);
    }
  };

  const updateItem = (id: string, updates: Partial<FileItem>) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const processQueue = async (currentQueue: FileItem[]) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    const pending = currentQueue.filter((item) => item.status === 'queued');
    const chunks: FileItem[][] = [];
    for (let i = 0; i < pending.length; i += MAX_CONCURRENT) {
      chunks.push(pending.slice(i, i + MAX_CONCURRENT));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map((item) => processFile(item)));
    }

    processingRef.current = false;
    setIsProcessing(false);

    // Check if there are new queued items added while processing
    setQueue((latestQueue) => {
      const newPending = latestQueue.filter((item) => item.status === 'queued');
      if (newPending.length > 0) {
        setTimeout(() => processQueue(latestQueue), 50);
      } else {
        onAllComplete?.();
      }
      return latestQueue;
    });
  };

  const processFile = async (item: FileItem) => {
    try {
      // 1. Hashing
      updateItem(item.id, { status: 'hashing', message: 'מחשב חתימת קובץ...' });
      const hash = await computeFileHash(item.file);

      // 2. Check duplicate
      updateItem(item.id, { status: 'checking_dup', message: 'בודק כפילויות...' });
      const checkRes = await fetch('/api/invoices/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });

      if (!checkRes.ok) {
        throw new Error('שגיאה בבדיקת כפילויות.');
      }

      const checkData = await checkRes.json();
      if (checkData.exists) {
        updateItem(item.id, {
          status: 'duplicate',
          message: `כפילות — ${checkData.invoice.supplier_name || 'ספק לא ידוע'}`,
        });
        return;
      }

      // 3. Upload + OCR
      updateItem(item.id, { status: 'uploading', message: 'מעלה ומפענח באמצעות AI...' });

      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('source', source);

      const response = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      });

      const responseData = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          updateItem(item.id, {
            status: 'duplicate',
            message: 'חשבונית כפולה — כבר קיימת במערכת',
          });
        } else {
          throw new Error(responseData.error || 'שגיאה בתהליך העיבוד.');
        }
        return;
      }

      if (responseData.code === 'CREDIT_NOTE_IGNORED') {
        updateItem(item.id, {
          status: 'credit_note',
          message: 'זוהתה חשבונית זיכוי — נפסחה',
        });
      } else {
        updateItem(item.id, {
          status: 'success',
          message: `✅ ${responseData.invoice?.supplier_name || 'הועלה בהצלחה'}`,
          invoice: responseData.invoice,
        });
        onUploadSuccess?.(responseData.invoice);
      }
    } catch (err: any) {
      console.error('File upload error:', err);
      updateItem(item.id, {
        status: 'error',
        message: err.message || 'אירעה שגיאה בלתי צפויה.',
      });
    }
  };

  const resetQueue = () => {
    setQueue([]);
  };

  const getStatusIcon = (status: FileItemStatus) => {
    switch (status) {
      case 'queued': return '⏳';
      case 'hashing':
      case 'checking_dup': return '🔒';
      case 'uploading': return '☁️';
      case 'success': return '✅';
      case 'duplicate': return '🔁';
      case 'credit_note': return '↩️';
      case 'error': return '❌';
    }
  };

  const getStatusColor = (status: FileItemStatus) => {
    switch (status) {
      case 'success': return 'var(--color-success)';
      case 'error': return 'var(--color-error)';
      case 'duplicate': return 'var(--color-warning)';
      case 'credit_note': return 'var(--color-text-secondary)';
      default: return 'var(--color-accent)';
    }
  };

  const isActive = (status: FileItemStatus) =>
    status === 'hashing' || status === 'checking_dup' || status === 'uploading';

  // Summary counts
  const total = queue.length;
  const successCount = queue.filter((f) => f.status === 'success').length;
  const errorCount = queue.filter((f) => f.status === 'error').length;
  const dupCount = queue.filter((f) => f.status === 'duplicate').length;
  const activeCount = queue.filter((f) => isActive(f.status)).length;
  const queuedCount = queue.filter((f) => f.status === 'queued').length;
  const allDone = total > 0 && activeCount === 0 && queuedCount === 0;

  return (
    <div className="card">
      <div className="card-body">
        {/* Drop Zone */}
        <div
          className={`file-uploader ${isDragOver ? 'dragging' : ''} ${queue.length > 0 ? 'compact' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={!isProcessing ? triggerFileInput : undefined}
          style={{
            cursor: !isProcessing ? 'pointer' : 'default',
            padding: queue.length > 0 ? 'var(--space-4)' : undefined,
            minHeight: queue.length > 0 ? '80px' : undefined,
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf, image/jpeg, image/png, image/webp"
            multiple
            style={{ display: 'none' }}
            disabled={isProcessing}
          />

          <div className="file-uploader-icon" style={{ fontSize: queue.length > 0 ? '1.5rem' : undefined }}>📤</div>

          <div className="file-uploader-text">
            גרור והשלך חשבוניות כאן, או <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>לחץ לבחירה</span>
          </div>
          <div className="file-uploader-hint">תומך בקבצי PDF, JPEG, PNG, WebP • ניתן להעלות מספר קבצים בו-זמנית</div>
        </div>

        {/* Queue List */}
        {queue.length > 0 && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            {/* Summary Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-glass)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-glass-border)',
                marginBottom: 'var(--space-3)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <span>📋 סה״כ: <strong>{total}</strong></span>
                {successCount > 0 && <span style={{ color: 'var(--color-success)' }}>✅ הצליחו: <strong>{successCount}</strong></span>}
                {errorCount > 0 && <span style={{ color: 'var(--color-error)' }}>❌ שגיאות: <strong>{errorCount}</strong></span>}
                {dupCount > 0 && <span style={{ color: 'var(--color-warning)' }}>🔁 כפילויות: <strong>{dupCount}</strong></span>}
                {(activeCount > 0 || queuedCount > 0) && <span style={{ color: 'var(--color-accent)' }}>⏳ בתהליך: <strong>{activeCount + queuedCount}</strong></span>}
              </div>
              {allDone && (
                <button className="btn btn-secondary btn-sm" onClick={resetQueue}>
                  נקה רשימה
                </button>
              )}
            </div>

            {/* File Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {queue.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${item.status === 'error' ? 'var(--color-error)' : 'var(--color-glass-border)'}`,
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {/* Status Icon */}
                  <div style={{ fontSize: '1.2rem', flexShrink: 0 }}>
                    {getStatusIcon(item.status)}
                  </div>

                  {/* File Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: 'var(--font-size-sm)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.file.name}
                    </div>
                    <div style={{
                      fontSize: 'var(--font-size-xs)',
                      color: getStatusColor(item.status),
                      marginTop: '2px',
                    }}>
                      {item.message}
                    </div>
                  </div>

                  {/* File Size */}
                  <div style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-muted)',
                    flexShrink: 0,
                  }}>
                    {(item.file.size / 1024).toFixed(0)} KB
                  </div>

                  {/* Progress indicator for active items */}
                  {isActive(item.status) && (
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid var(--color-glass-border)',
                      borderTopColor: 'var(--color-accent)',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                      flexShrink: 0,
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Spinner keyframes */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

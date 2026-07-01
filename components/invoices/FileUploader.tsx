'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { computeFileHash } from '@/lib/utils/client-hash';

interface FileUploaderProps {
  onUploadSuccess?: (invoice: any) => void;
  source?: 'manual_upload' | 'email' | 'telegram';
}

type UploadState = 'idle' | 'hashing' | 'checking_dup' | 'uploading' | 'ocr' | 'success' | 'error';

export default function FileUploader({ onUploadSuccess, source = 'manual_upload' }: FileUploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const processFile = async (file: File) => {
    // Validate file type
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setState('error');
      setMessage('Invalid file type');
      setErrorDetails('Please upload a PDF or an Image file (JPEG, PNG, WebP).');
      return;
    }

    try {
      // 1. Hashing
      setState('hashing');
      setMessage('Computing file signature...');
      const hash = await computeFileHash(file);

      // 2. Check duplicate
      setState('checking_dup');
      setMessage('Verifying document status...');
      const checkRes = await fetch('/api/invoices/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });

      if (!checkRes.ok) {
        throw new Error('Failed to run duplicate verification.');
      }

      const checkData = await checkRes.json();
      if (checkData.exists) {
        setState('error');
        setMessage('Duplicate invoice detected');
        setErrorDetails(
          `This document was already uploaded as invoice from "${checkData.invoice.supplier_name || 'unknown'}" on ${new Date(
            checkData.invoice.invoice_date || ''
          ).toLocaleDateString('he-IL')}.`
        );
        return;
      }

      // 3. Upload file and trigger OCR
      setState('uploading');
      setMessage('Uploading to Google Drive & running AI OCR...');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', source);

      const response = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      });

      const responseData = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setState('error');
          setMessage('Duplicate invoice');
          setErrorDetails('This file hash already exists in the database.');
        } else {
          throw new Error(responseData.error || 'Failed to complete invoice ingestion.');
        }
        return;
      }

      if (responseData.code === 'CREDIT_NOTE_IGNORED') {
        setState('success');
        setMessage('Credit note detected and skipped');
        setErrorDetails('Credit note documents are ignored by accounting configuration.');
      } else {
        setState('success');
        setMessage('Invoice uploaded and parsed successfully!');
        setErrorDetails(null);
        if (onUploadSuccess && responseData.invoice) {
          onUploadSuccess(responseData.invoice);
        }
      }

      // Reset back to idle after 4 seconds
      setTimeout(() => {
        setState('idle');
        setMessage('');
        setProgress(0);
      }, 4000);

    } catch (err: any) {
      console.error('File upload error:', err);
      setState('error');
      setMessage('Processing failed');
      setErrorDetails(err.message || 'An unexpected error occurred during OCR scanning.');
    }
  };

  const getStatusIcon = () => {
    switch (state) {
      case 'hashing':
      case 'checking_dup':
        return '🔒';
      case 'uploading':
        return '☁️';
      case 'ocr':
        return '👁️';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📤';
    }
  };

  return (
    <div className="card">
      <div className="card-body">
        <div
          className={`file-uploader ${isDragOver ? 'dragging' : ''} ${state !== 'idle' ? 'processing' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={state === 'idle' || state === 'error' || state === 'success' ? triggerFileInput : undefined}
          style={{ cursor: state === 'idle' || state === 'error' || state === 'success' ? 'pointer' : 'default' }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf, image/jpeg, image/png, image/webp"
            style={{ display: 'none' }}
            disabled={state !== 'idle' && state !== 'error' && state !== 'success'}
          />

          <div className="file-uploader-icon">{getStatusIcon()}</div>

          {state === 'idle' && (
            <>
              <div className="file-uploader-text">
                Drag and drop your invoice here, or <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>browse</span>
              </div>
              <div className="file-uploader-hint">Supports PDF, JPEG, PNG, WebP (Max 10MB)</div>
            </>
          )}

          {state !== 'idle' && (
            <div style={{ width: '100%', maxWidth: '320px', margin: '0 auto' }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', marginBottom: 'var(--space-2)' }}>
                {message}
              </div>
              
              {errorDetails && (
                <div style={{ fontSize: 'var(--font-size-sm)', color: state === 'error' ? 'var(--color-error)' : 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.4 }}>
                  {errorDetails}
                </div>
              )}

              {(state === 'hashing' || state === 'checking_dup' || state === 'uploading' || state === 'ocr') && (
                <div style={{ width: '100%', height: '4px', background: 'var(--color-glass-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden', position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      height: '100%',
                      background: 'var(--color-accent)',
                      borderRadius: 'var(--radius-full)',
                      width: state === 'hashing' ? '30%' : state === 'checking_dup' ? '60%' : state === 'uploading' ? '80%' : '95%',
                      transition: 'width 0.5s ease-out',
                    }}
                  />
                </div>
              )}

              {(state === 'success' || state === 'error') && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setState('idle');
                    setMessage('');
                    setErrorDetails(null);
                  }}
                  style={{ marginTop: 'var(--space-2)' }}
                >
                  Upload Another File
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

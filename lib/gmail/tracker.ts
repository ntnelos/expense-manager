import { createServerClient } from '@/lib/supabase/server';

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  details?: string;
}

export interface SyncRunState {
  id: string;
  trigger_type: 'manual' | 'cron';
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at?: string | null;
  total_messages: number;
  processed_messages: number;
  new_invoices_count: number;
  current_step: string;
  logs: SyncLogEntry[];
  error_message?: string | null;
}

// Store active run state in global memory for immediate sub-second access
declare global {
  // eslint-disable-next-line no-var
  var __activeGmailSyncRun: SyncRunState | null;
  // eslint-disable-next-line no-var
  var __recentGmailSyncRuns: SyncRunState[] | undefined;
}

if (!globalThis.__recentGmailSyncRuns) {
  globalThis.__recentGmailSyncRuns = [];
}

export class GmailSyncTracker {
  static getActiveRun(): SyncRunState | null {
    return globalThis.__activeGmailSyncRun || null;
  }

  static async startRun(triggerType: 'manual' | 'cron' = 'manual'): Promise<SyncRunState> {
    const runId = crypto.randomUUID();
    const newRun: SyncRunState = {
      id: runId,
      trigger_type: triggerType,
      status: 'running',
      started_at: new Date().toISOString(),
      finished_at: null,
      total_messages: 0,
      processed_messages: 0,
      new_invoices_count: 0,
      current_step: 'מתחיל סריקה...',
      logs: [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `החלה סריקת Gmail (${triggerType === 'cron' ? 'אוטומטית' : 'יזומה'}).`,
        }
      ],
      error_message: null
    };

    globalThis.__activeGmailSyncRun = newRun;

    // Try saving to Supabase
    try {
      const supabase = createServerClient();
      await supabase.from('gmail_sync_runs').insert({
        id: newRun.id,
        trigger_type: newRun.trigger_type,
        status: newRun.status,
        started_at: newRun.started_at,
        total_messages: 0,
        processed_messages: 0,
        new_invoices_count: 0,
        current_step: newRun.current_step,
        logs: newRun.logs
      });
    } catch (err) {
      console.warn('[GmailTracker] Could not persist start run to Supabase:', err);
    }

    return newRun;
  }

  static log(
    level: 'info' | 'success' | 'warn' | 'error',
    message: string,
    details?: string
  ) {
    const run = globalThis.__activeGmailSyncRun;
    const entry: SyncLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      details
    };

    if (run) {
      run.logs.push(entry);
      // Keep max 200 log entries in memory
      if (run.logs.length > 200) {
        run.logs = run.logs.slice(-200);
      }
      run.current_step = message;
    }

    console.log(`[Gmail Sync Log] [${level.toUpperCase()}] ${message} ${details ? JSON.stringify(details) : ''}`);
    return entry;
  }

  static updateProgress(processed: number, total: number, currentStep?: string) {
    const run = globalThis.__activeGmailSyncRun;
    if (!run) return;

    run.processed_messages = processed;
    run.total_messages = total;
    if (currentStep) {
      run.current_step = currentStep;
    }

    // Debounced or non-blocking DB update
    this.persistActiveRunState();
  }

  static async completeRun(newInvoicesCount: number) {
    const run = globalThis.__activeGmailSyncRun;
    if (!run) return;

    run.status = 'completed';
    run.finished_at = new Date().toISOString();
    run.new_invoices_count = newInvoicesCount;
    run.current_step = `סריקה הושלמה! נוספו ${newInvoicesCount} חשבוניות חדשות.`;

    this.log('success', `הסריקה הושלמה בהצלחה. נוספו ${newInvoicesCount} חשבוניות חדשות.`);

    await this.persistActiveRunState(true);

    // Add to recent in-memory runs list
    if (!globalThis.__recentGmailSyncRuns) {
      globalThis.__recentGmailSyncRuns = [];
    }
    globalThis.__recentGmailSyncRuns.unshift({ ...run });
    if (globalThis.__recentGmailSyncRuns.length > 10) {
      globalThis.__recentGmailSyncRuns = globalThis.__recentGmailSyncRuns.slice(0, 10);
    }

    // Clear active run after 10 seconds or keep as completed
    globalThis.__activeGmailSyncRun = null;
  }

  static async failRun(errorMessage: string) {
    const run = globalThis.__activeGmailSyncRun;
    if (!run) return;

    run.status = 'failed';
    run.finished_at = new Date().toISOString();
    run.error_message = errorMessage;
    run.current_step = `שגיאה: ${errorMessage}`;

    this.log('error', `הסריקה נכשלה: ${errorMessage}`);

    await this.persistActiveRunState(true);

    if (!globalThis.__recentGmailSyncRuns) {
      globalThis.__recentGmailSyncRuns = [];
    }
    globalThis.__recentGmailSyncRuns.unshift({ ...run });
    if (globalThis.__recentGmailSyncRuns.length > 10) {
      globalThis.__recentGmailSyncRuns = globalThis.__recentGmailSyncRuns.slice(0, 10);
    }

    globalThis.__activeGmailSyncRun = null;
  }

  static async persistActiveRunState(isFinal = false) {
    const run = globalThis.__activeGmailSyncRun;
    if (!run) return;

    try {
      const supabase = createServerClient();
      await supabase
        .from('gmail_sync_runs')
        .update({
          status: run.status,
          finished_at: run.finished_at,
          total_messages: run.total_messages,
          processed_messages: run.processed_messages,
          new_invoices_count: run.new_invoices_count,
          current_step: run.current_step,
          logs: run.logs,
          error_message: run.error_message
        })
        .eq('id', run.id);
    } catch (err) {
      if (isFinal) {
        console.warn('[GmailTracker] Error updating final run state in Supabase:', err);
      }
    }
  }

  static async getRecentRuns(limit = 5): Promise<SyncRunState[]> {
    try {
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('gmail_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);

      if (!error && data && data.length > 0) {
        return data as SyncRunState[];
      }
    } catch (err) {
      console.warn('[GmailTracker] Could not fetch runs from Supabase, falling back to memory:', err);
    }

    return globalThis.__recentGmailSyncRuns || [];
  }
}

import { buildLearnedPairs, proposeMatches, type MatchProposal } from './engine';
import { createMatch } from './persist';

type Supabase = any; // the project's server client is untyped

/** Loads every open invoice and card line, plus supplier↔description pairs learned from past matches. */
export async function loadOpenMatchingData(supabase: Supabase) {
  const [invRes, lineRes, histRes] = await Promise.all([
    // 'error' = OCR failed, so the amounts can't be trusted for matching
    supabase.from('invoices').select('*').eq('status', 'new'),
    supabase.from('expense_lines').select('*').eq('status', 'unapproved'),
    supabase.from('matches').select('invoice:invoices(supplier_name), line:expense_lines(description)'),
  ]);
  if (invRes.error) throw invRes.error;
  if (lineRes.error) throw lineRes.error;

  const learned = buildLearnedPairs(
    (histRes.data || []).map((r: any) => ({ supplier_name: r.invoice?.supplier_name ?? null, description: r.line?.description ?? null }))
  );
  return { invoices: invRes.data || [], lines: lineRes.data || [], learned };
}

/** All proposals across all months, for the matching arena. */
export async function getMatchProposals(supabase: Supabase): Promise<MatchProposal<any, any>[]> {
  const { invoices, lines, learned } = await loadOpenMatchingData(supabase);
  return proposeMatches(invoices, lines, learned);
}

export interface AutoMatchResult {
  invoiceId: string;
  supplierName: string | null;
  lineId: string;
  lineDescription: string | null;
  lineAmount: number;
  lineDate: string | null;
}

/**
 * Called right after invoices or card lines arrive. Applies only 'high' confidence 1:1 proposals that
 * involve the new items (exact amount, supplier tied by name or history, within a week, no close rival).
 * Everything else stays a proposal in the matching arena. Never throws: a failed auto-match must not
 * fail the upload / import that triggered it.
 */
export async function autoMatchOnArrival(
  supabase: Supabase,
  scope: { invoiceIds?: string[]; lineIds?: string[] }
): Promise<AutoMatchResult[]> {
  const invoiceIds = new Set(scope.invoiceIds || []);
  const lineIds = new Set(scope.lineIds || []);
  if (invoiceIds.size === 0 && lineIds.size === 0) return [];

  try {
    const { invoices, lines, learned } = await loadOpenMatchingData(supabase);
    const proposals = proposeMatches(invoices, lines, learned).filter(
      p => p.confidence === 'high' && p.invoices.length === 1 &&
        (invoiceIds.has(p.invoices[0].id) || lineIds.has(p.line.id))
    );

    const results: AutoMatchResult[] = [];
    for (const p of proposals) {
      const inv = p.invoices[0];
      try {
        const { error } = await createMatch(supabase, {
          invoice_id: inv.id,
          expense_line_id: p.line.id,
          matched_amount: inv.total_amount || p.line.amount,
          match_type: 'auto_exact',
          matched_by: 'auto_on_arrival',
          confidence_score: p.score,
          notes: p.reasons.join(' · '),
        });
        if (error) continue; // already matched meanwhile
        results.push({
          invoiceId: inv.id,
          supplierName: inv.supplier_name,
          lineId: p.line.id,
          lineDescription: p.line.description,
          lineAmount: p.line.amount,
          lineDate: p.line.transaction_date,
        });
      } catch (err) {
        console.error('[AutoMatch] Failed to create match', inv.id, p.line.id, err);
      }
    }
    if (results.length > 0) console.log(`[AutoMatch] Applied ${results.length} match(es) on arrival.`);
    return results;
  } catch (err) {
    console.error('[AutoMatch] Auto-match on arrival failed:', err);
    return [];
  }
}

// Invoice ↔ card-line matching engine. Pure functions with no server or browser imports, shared by
// the auto-match on arrival (server) and the matching arena (client).

export interface MatchInvoice {
  id: string;
  supplier_name: string | null;
  total_amount: number | null;
  currency?: string | null;
  invoice_date: string | null;
}

export interface MatchLine {
  id: string;
  amount: number;
  transaction_date: string | null;
  description: string | null;
  /** Full deal amount for installment purchases (installment_total > 1). */
  total_amount?: number | null;
  installment_total?: number | null;
}

export type Confidence = 'high' | 'medium';

export interface MatchProposal<I extends MatchInvoice = MatchInvoice, L extends MatchLine = MatchLine> {
  invoices: I[];
  line: L;
  score: number;
  confidence: Confidence;
  /** Short Hebrew reasons for the UI, e.g. "סכום זהה", "ספק מוכר מהתאמות קודמות". */
  reasons: string[];
}

/** Supplier ↔ card-description pairs from confirmed matches, normalized. See buildLearnedPairs. */
export type LearnedPairs = Set<string>;

// ---------- names ----------

const LEGAL_SUFFIX = /(^|\s)(בע"מ|בעמ|בע״מ|ע"ר|ע\.ר|ltd|limited|inc|llc|gmbh|emea|ireland|israel|ישראל)(?=\s|$)/gi;

/** Lowercase, drop legal suffixes, punctuation and tokens with digits (card codes like "*N3J5RDE4W4"). */
export function normalizeName(text: string | null | undefined): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}"״ ]/gu, ' ')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/["״]/g, '')
    .split(/\s+/)
    .filter(t => t && !/\d/.test(t))
    .join(' ')
    .trim();
}

// Card descriptions that say how it was paid, not who was paid.
const GENERIC_WORDS = new Set(['bit', 'ביט', 'paypal', 'פייפאל', 'העברה', 'הוראת', 'קבע', 'הוק', 'בנהפ', 'ב', 'תשלום', 'www', 'com']);

/** True when nothing in the description names the payee ("BIT", "העברה ב BIT בנה"פ"). "בזק הוראת קבע" is not generic. */
export function isGenericDescription(description: string | null | undefined): boolean {
  const tokens = normalizeName(description).replace(/[׳']/g, '').split(' ').filter(Boolean);
  return tokens.filter(t => !GENERIC_WORDS.has(t) && t.length > 1).length === 0;
}

/** 0–1 similarity between a supplier name and a card description. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const sa = normalizeName(a);
  const sb = normalizeName(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const compactA = sa.replace(/\s/g, '');
  const compactB = sb.replace(/\s/g, '');
  if (compactA.length >= 3 && compactB.length >= 3 && (compactA.includes(compactB) || compactB.includes(compactA))) return 0.9;
  const tokensA = sa.split(' ').filter(t => t.length > 2);
  const tokensB = sb.split(' ').filter(t => t.length > 2);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const hits = tokensA.filter(t => tokensB.some(x => x.includes(t) || t.includes(x))).length;
  const overlap = (hits / Math.min(tokensA.length, tokensB.length)) * 0.8;
  // The brand is usually the first word: "בזק החברה הישראלית לתקשורת" ↔ "בזק הוראת קבע".
  const sameBrand = tokensA[0] === tokensB[0] ? 0.6 : 0;
  return Math.max(overlap, sameBrand);
}

const learnedKey = (supplier: string | null | undefined, description: string | null | undefined) =>
  `${normalizeName(supplier)}|${normalizeName(description)}`;

export function buildLearnedPairs(history: { supplier_name: string | null; description: string | null }[]): LearnedPairs {
  const pairs: LearnedPairs = new Set();
  for (const h of history) {
    if (!h.supplier_name || !h.description || isGenericDescription(h.description)) continue;
    pairs.add(learnedKey(h.supplier_name, h.description));
  }
  return pairs;
}

// ---------- scoring ----------

const DAY_MS = 864e5;

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(ta - tb) / DAY_MS;
}

/** The amount invoices should add up to: the full deal for installment purchases, otherwise the charge. */
export function lineTargetAmount(line: MatchLine): number {
  if ((line.installment_total || 0) > 1 && line.total_amount) return line.total_amount;
  return line.amount;
}

type AmountKind = 'exact' | 'fx' | 'near';

function compareAmounts(invoiceTotal: number, target: number, foreign: boolean): AmountKind | null {
  const diff = Math.abs(invoiceTotal - target);
  if (diff < 0.01) return 'exact';
  // Foreign-currency invoices are converted at the invoice-date rate; the card charge uses its own rate + fees.
  if (foreign && target !== 0 && diff / Math.abs(target) <= 0.04) return 'fx';
  if (diff <= 1) return 'near';
  return null;
}

type NameKind = 'learned' | 'strong' | 'partial' | 'weak' | 'none' | 'generic';

function compareNames(inv: MatchInvoice, line: MatchLine, learned: LearnedPairs): NameKind {
  if (learned.has(learnedKey(inv.supplier_name, line.description))) return 'learned';
  if (isGenericDescription(line.description)) return 'generic';
  const sim = nameSimilarity(inv.supplier_name, line.description);
  if (sim >= 0.85) return 'strong';
  if (sim >= 0.5) return 'partial';
  if (sim > 0) return 'weak';
  return 'none';
}

const AMOUNT_POINTS: Record<AmountKind, number> = { exact: 50, fx: 40, near: 30 };
const NAME_POINTS: Record<NameKind, number> = { learned: 35, strong: 30, partial: 20, weak: 8, generic: 0, none: 0 };

function datePoints(days: number | null): number {
  if (days === null) return 0;
  if (days < 1) return 30;
  if (days <= 3) return 25;
  if (days <= 7) return 18;
  if (days <= 31) return 10;
  if (days <= 62) return 4;
  return 0;
}

export interface PairScore {
  score: number;
  amount: AmountKind;
  name: NameKind;
  days: number | null;
  reasons: string[];
}

/** Scores one invoice against one card line. Null when the amounts don't agree (never a 1:1 match). */
export function scorePair(inv: MatchInvoice, line: MatchLine, learned: LearnedPairs = new Set()): PairScore | null {
  if (inv.total_amount === null || inv.total_amount === undefined || !line.amount) return null;
  const foreign = !!inv.currency && inv.currency !== 'ILS';
  const amount = compareAmounts(inv.total_amount, lineTargetAmount(line), foreign);
  if (!amount) return null;
  const name = compareNames(inv, line, learned);
  const days = daysBetween(inv.invoice_date, line.transaction_date);

  const reasons: string[] = [];
  reasons.push(
    amount === 'exact'
      ? ((line.installment_total || 0) > 1 ? 'סכום זהה לסך העסקה בתשלומים' : 'סכום זהה')
      : amount === 'fx' ? 'סכום קרוב (הפרש שער מטבע)' : 'הפרש סכום קטן'
  );
  if (name === 'learned') reasons.push('ספק מוכר מהתאמות קודמות');
  else if (name === 'strong') reasons.push('שם ספק תואם');
  else if (name === 'partial') reasons.push('שם ספק דומה');
  if (days !== null) reasons.push(days < 1 ? 'אותו תאריך' : `${Math.round(days)} ימים הפרש`);

  // Tiny tie-breaker so recurring same-amount charges pair with the closest date.
  const score = AMOUNT_POINTS[amount] + NAME_POINTS[name] + datePoints(days) - (days ?? 90) * 0.01;
  return { score, amount, name, days, reasons };
}

// ---------- proposals ----------

export const PROPOSAL_THRESHOLD = 75;
const AMBIGUITY_MARGIN = 10;
// Several invoices paid in one charge can be months old (paid late), so look back further than for 1:1.
const MULTI_MAX_DAYS_BEFORE = 130;
const MULTI_MAX_DAYS_AFTER = 7;
const MULTI_MAX_GROUP = 12;
const MULTI_MAX_PICK = 4;

function isHighConfidence(s: PairScore): boolean {
  const nameTied = s.name === 'learned' || s.name === 'strong';
  const dateClose = s.days !== null && s.days <= 7;
  return s.amount === 'exact' && nameTied && dateClose;
}

/**
 * Proposes matches between open invoices and open card lines.
 * 1) 1:1 — every scoring pair, assigned best-first globally (not in invoice order).
 * 2) many→one — 2–4 invoices of one supplier that add up exactly to a remaining line.
 * A 1:1 proposal is 'high' confidence only when the amount is exact, the supplier is tied by name or
 * history, the dates are within a week, and no other candidate scores close to it.
 */
export function proposeMatches<I extends MatchInvoice, L extends MatchLine>(
  invoices: I[],
  lines: L[],
  learned: LearnedPairs = new Set(),
  threshold = PROPOSAL_THRESHOLD
): MatchProposal<I, L>[] {
  const pairs: { inv: I; line: L; s: PairScore }[] = [];
  for (const inv of invoices) {
    for (const line of lines) {
      const s = scorePair(inv, line, learned);
      if (s && s.score >= threshold) pairs.push({ inv, line, s });
    }
  }
  pairs.sort((a, b) => b.s.score - a.s.score);

  // Best competing score per invoice / per line, to flag ambiguous picks.
  const bestByInv = new Map<string, number[]>();
  const bestByLine = new Map<string, number[]>();
  for (const p of pairs) {
    (bestByInv.get(p.inv.id) || bestByInv.set(p.inv.id, []).get(p.inv.id)!).push(p.s.score);
    (bestByLine.get(p.line.id) || bestByLine.set(p.line.id, []).get(p.line.id)!).push(p.s.score);
  }
  const hasRival = (scores: number[] | undefined, own: number) =>
    (scores || []).filter(sc => sc !== own).some(sc => own - sc < AMBIGUITY_MARGIN) ||
    (scores || []).filter(sc => sc === own).length > 1;

  const usedInv = new Set<string>();
  const usedLine = new Set<string>();
  const proposals: MatchProposal<I, L>[] = [];

  for (const p of pairs) {
    if (usedInv.has(p.inv.id) || usedLine.has(p.line.id)) continue;
    usedInv.add(p.inv.id);
    usedLine.add(p.line.id);
    const ambiguous = hasRival(bestByInv.get(p.inv.id), p.s.score) || hasRival(bestByLine.get(p.line.id), p.s.score);
    const reasons = ambiguous ? [...p.s.reasons, 'יש מועמד נוסף דומה'] : p.s.reasons;
    proposals.push({
      invoices: [p.inv],
      line: p.line,
      score: Math.round(p.s.score),
      confidence: !ambiguous && isHighConfidence(p.s) ? 'high' : 'medium',
      reasons,
    });
  }

  // many → one
  for (const line of lines) {
    if (usedLine.has(line.id) || isGenericDescription(line.description)) continue;
    const target = lineTargetAmount(line);
    const groups = new Map<string, I[]>();
    for (const inv of invoices) {
      // Credit notes (negative) are allowed: an invoice minus its credit note can be one charge.
      if (usedInv.has(inv.id) || !inv.total_amount || !inv.invoice_date || !line.transaction_date) continue;
      const daysBefore = (new Date(line.transaction_date).getTime() - new Date(inv.invoice_date).getTime()) / DAY_MS;
      if (daysBefore > MULTI_MAX_DAYS_BEFORE || daysBefore < -MULTI_MAX_DAYS_AFTER) continue;
      const name = compareNames(inv, line, learned);
      if (name !== 'learned' && name !== 'strong' && name !== 'partial') continue; // a sum alone is a coincidence
      const key = normalizeName(inv.supplier_name);
      (groups.get(key) || groups.set(key, []).get(key)!).push(inv);
    }
    let found: I[] | null = null;
    for (const group of groups.values()) {
      if (group.length < 2 || group.length > MULTI_MAX_GROUP) continue;
      for (let mask = 1; mask < 1 << group.length && !found; mask++) {
        const picked = group.filter((_, i) => mask & (1 << i));
        if (picked.length < 2 || picked.length > MULTI_MAX_PICK) continue;
        const sum = picked.reduce((t, inv) => t + (inv.total_amount || 0), 0);
        if (Math.abs(sum - target) < 0.01) found = picked;
      }
      if (found) break;
    }
    if (found) {
      found.forEach(inv => usedInv.add(inv.id));
      usedLine.add(line.id);
      proposals.push({
        invoices: found,
        line,
        score: 80,
        confidence: 'medium',
        reasons: [`${found.length} חשבוניות של אותו ספק שסכומן זהה לחיוב`],
      });
    }
  }

  return proposals;
}

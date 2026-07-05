import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import crypto from 'crypto';

function hashString(str: string) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export async function POST(req: Request) {
  try {
    const { lines, sourceFile } = await req.json();

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'No lines provided' }, { status: 400 });
    }

    const supabase = createServerClient();
    
    let inserted = 0;
    let duplicates = 0;
    let errors = 0;
    const skippedLines: any[] = [];

    // Process in batches or one by one
    // For simplicity, we process them one by one to handle conflict exceptions gracefully
    for (const line of lines) {
      if (!line.transaction_date || line.amount == null) {
        errors++;
        continue;
      }

      // Compute unique hash based on core identity of the line
      // Format date strictly to YYYY-MM-DD
      const date = line.transaction_date.substring(0, 10);
      const amount = Number(line.amount).toFixed(2);
      const desc = (line.description || '').trim();
      
      const contentHashStr = `${date}|${amount}|${desc}`;
      const content_hash = hashString(contentHashStr);

      const { error } = await supabase.from('expense_lines').insert({
        transaction_date: date,
        charge_date: line.charge_date ? line.charge_date.substring(0, 10) : null,
        amount: Number(line.amount),
        total_amount: line.total_amount ? Number(line.total_amount) : null,
        installment_current: line.installment_current || null,
        installment_total: line.installment_total || null,
        description: desc,
        card_last_digits: line.card_last_digits,
        source_identifier: line.source_identifier,
        original_category: line.original_category,
        currency: line.currency || 'ILS',
        source_file: sourceFile,
        content_hash,
        status: 'unapproved', // Default
      });

      if (error) {
        if (error.code === '23505') { // Unique constraint violation (content_hash)
          duplicates++;
          skippedLines.push(line);
        } else {
          console.error('Insert error:', error);
          errors++;
        }
      } else {
        inserted++;
      }
    }

    return NextResponse.json({ inserted, duplicates, errors, skippedLines });
  } catch (err: any) {
    console.error('Import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

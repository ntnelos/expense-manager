import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const supabase = createServerClient();

    const { error } = await supabase
      .from('expense_lines')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting expense line:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

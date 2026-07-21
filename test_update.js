require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: invoice } = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(1).single();
  console.log("Testing invoice ID:", invoice.id, "Date:", invoice.invoice_date);

  const res = await fetch(`http://localhost:3000/api/invoices/${invoice.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_date: '2020-05-05', supplier_name: 'Test Supplier 2' })
  });
  
  const text = await res.text();
  console.log("Response:", res.status, text);
}
test().catch(console.error);

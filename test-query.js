require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, status, sent_to_accountant')
    .in('status', ['fully_matched','approved_no_expense']);
    
  console.log("ALL MATCHED INVOICES:");
  console.log(data);

  const { data: data2, error: error2 } = await supabase
    .from('invoices')
    .select('id, status, sent_to_accountant')
    .in('status', ['fully_matched','approved_no_expense'])
    .not('sent_to_accountant', 'eq', true);

  console.log("\nWITH .not('sent_to_accountant', 'eq', true):");
  console.log(data2);
}

test();

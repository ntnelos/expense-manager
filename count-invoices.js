require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('invoices')
    .select('id')
    .in('status', ['approved_no_expense', 'fully_matched'])
    .not('sent_to_accountant', 'eq', true);
    
  console.log("Count:", data ? data.length : "error", error);
}
run();

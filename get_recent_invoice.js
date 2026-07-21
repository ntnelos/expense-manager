require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, supplier_name, invoice_date, drive_file_id, original_filename, updated_at')
    .order('updated_at', { ascending: false })
    .limit(3);
    
  console.log(invoice);
}
test().catch(console.error);

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { error } = await supabase.rpc('execute_sql', { sql: 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approval_note TEXT;' })
  console.log('RPC execute_sql error:', error)
}
run()

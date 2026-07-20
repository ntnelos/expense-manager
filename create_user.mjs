import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load .env.local variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or Service Role Key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createOrUpdateUser() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: node create_user.mjs <email> <password>');
    process.exit(1);
  }

  console.log(`Checking if user exists: ${email}...`);

  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError.message);
    process.exit(1);
  }

  const existingUser = usersData.users.find(u => u.email === email);

  if (existingUser) {
    console.log('User already exists, updating password and confirming email...');
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password: password,
      email_confirm: true
    });
    
    if (error) {
      console.error('Error updating user:', error.message);
    } else {
      console.log('✅ Password updated successfully! You can now log in.');
    }
  } else {
    console.log('User does not exist, creating new user...');
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      console.error('Error creating user:', error.message);
    } else {
      console.log('✅ User created successfully!', data.user.id);
    }
  }
}

createOrUpdateUser();

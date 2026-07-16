'use server';

import { createSSRClient } from '@/lib/supabase/ssr';
import { redirect } from 'next/navigation';

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'נא להזין אימייל וסיסמה' };
  }

  const supabase = await createSSRClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: 'אימייל או סיסמה שגויים' };
  }

  redirect('/');
}

export async function logout() {
  const supabase = await createSSRClient();
  await supabase.auth.signOut();
  redirect('/login');
}

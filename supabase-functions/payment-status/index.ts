// Supabase Edge Function: payment-status
import { serve } from 'std/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

serve(async (req) => {
  const url = new URL(req.url);
  const month_key = url.searchParams.get('month_key');
  // TODO: Replace with your real guardian auth/session logic
  const guardian_email = req.headers.get('x-guardian-email');
  if (!guardian_email) return new Response('Unauthorized', { status: 401 });

  const { data } = await supabase
    .from('payments')
    .select('month_key,status,amount,currency,paid_at')
    .eq('guardian_email', guardian_email.toLowerCase())
    .eq('month_key', month_key)
    .maybeSingle();

  if (!data) {
    return new Response(JSON.stringify({ month_key, status: 'unpaid' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Supabase Edge Function: create-checkout-session
import Stripe from 'stripe';
import { serve } from 'std/server';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const APP_BASE_URL = Deno.env.get('APP_BASE_URL');

serve(async (req) => {
  try {
    const { month_key } = await req.json();
    // TODO: Replace with your real guardian auth/session logic
    const guardian_email = req.headers.get('x-guardian-email');
    if (!guardian_email) return new Response('Unauthorized', { status: 401 });

    // 1. Get monthly fee
    const { data: fee } = await supabase
      .from('guardian_monthly_fees')
      .select('amount_cents,currency')
      .eq('guardian_email', guardian_email.toLowerCase())
      .eq('month_key', month_key)
      .single();
    if (!fee) return new Response('No fee configured', { status: 400 });

    // 2. Upsert payment row
    const amount = fee.amount_cents;
    const currency = fee.currency || 'usd';
    const amount_decimal = amount / 100;
    const { data: paymentRow } = await supabase
      .from('payments')
      .upsert({
        guardian_email,
        month_key,
        amount: amount_decimal,
        amount_cents: amount,
        currency,
        status: 'pending',
        paid_at: null
      }, { onConflict: 'guardian_email,month_key' })
      .select('*')
      .single();

    // 3. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${APP_BASE_URL}/member-portal.html?pay=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_BASE_URL}/member-portal.html?pay=cancel`,
      customer_email: guardian_email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          product_data: { name: `Monthly Tuition (${month_key})` },
          unit_amount: amount
        }
      }],
      metadata: {
        payment_id: paymentRow.id,
        guardian_email,
        month_key
      }
    });

    // 4. Store session id
    await supabase.from('payments').update({
      stripe_checkout_session_id: session.id,
      checkout_expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
    }).eq('id', paymentRow.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response('Error: ' + String(err), { status: 500 });
  }
});

// Supabase Edge Function: stripe-webhook
import Stripe from 'stripe';
import { serve } from 'std/server';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response('Invalid signature', { status: 400 });
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('stripe_event_id,status')
    .eq('stripe_event_id', event.id)
    .maybeSingle();
  if (existing?.status === 'processed') return new Response('ok', { status: 200 });
  if (!existing) {
    await supabase.from('stripe_webhook_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event,
      status: 'received'
    });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const paymentId = session.metadata?.payment_id;
      const paymentIntentId = session.payment_intent;
      await supabase.from('payments').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntentId || null,
        stripe_customer_id: session.customer || null,
        stripe_event_last_id: event.id
      }).eq('id', paymentId);
    }
    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object;
      const paymentId = session.metadata?.payment_id;
      await supabase.from('payments').update({
        status: 'failed',
        stripe_event_last_id: event.id
      }).eq('id', paymentId);
    }
    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent;
      await supabase.from('payments').update({
        status: 'refunded',
        stripe_event_last_id: event.id
      }).eq('stripe_payment_intent_id', paymentIntentId);
    }
    await supabase.from('stripe_webhook_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      error_message: null
    }).eq('stripe_event_id', event.id);
    return new Response('ok', { status: 200 });
  } catch (err) {
    await supabase.from('stripe_webhook_events').update({
      status: 'failed',
      error_message: String(err)
    }).eq('stripe_event_id', event.id);
    return new Response('processing failed', { status: 500 });
  }
});

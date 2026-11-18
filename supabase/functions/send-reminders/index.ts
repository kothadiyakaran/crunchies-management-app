// send-reminders — daily Web Push reminders for Crunchies.
// Spec: docs/superpowers/specs/2026-11-18-reminders-and-calendar-design.md
//
// POST {action:"run", date?, dryRun?, force?}  + header x-cron-secret   (pg_cron)
// POST {action:"ensure-keys"}                  + Authorization: Bearer <user JWT>
//
// Deployed with verify_jwt=false: the cron caller has no user JWT, so each
// action authenticates itself.

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { buildRunPayloads, nextWorkingDays, type DueOrder, type PushPayload } from '../_shared/reminders.ts';

const CONTACT = 'https://www.crunchies.app';
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function ensureKeys(): Promise<{ keys: CryptoKeyPair; publicKey: string }> {
  const { data, error } = await admin.rpc('reminders_get_vapid');
  if (error) throw new Error(`reminders_get_vapid: ${error.message}`);
  const row = (data as { public_key: string; public_jwk: JsonWebKey; private_jwk: JsonWebKey }[] | null)?.[0];
  if (row) {
    const keys = await webpush.importVapidKeys({ publicKey: row.public_jwk, privateKey: row.private_jwk });
    return { keys, publicKey: row.public_key };
  }
  const keys = await webpush.generateVapidKeys({ extractable: true });
  const exported = await webpush.exportVapidKeys(keys);
  const publicKey = await webpush.exportApplicationServerKey(keys);
  const { data: winner, error: storeErr } = await admin.rpc('reminders_store_vapid', {
    p_public_key: publicKey,
    p_public_jwk: exported.publicKey,
    p_private_jwk: exported.privateKey,
  });
  if (storeErr) throw new Error(`reminders_store_vapid: ${storeErr.message}`);
  if (winner !== publicKey) return ensureKeys(); // lost a first-run race; use the stored pair
  return { keys, publicKey };
}

type RawOrder = {
  id: string;
  ordered_at: string;
  target_fulfilment_date: string;
  customers: { name: string } | null;
  order_items: { qty: number | string; products: { name: string; unit: string } | null }[] | null;
};

async function loadInputs(date: string) {
  const window = nextWorkingDays(date, 2);
  const [ordersRes, eventsRes] = await Promise.all([
    admin
      .from('orders')
      .select('id, ordered_at, target_fulfilment_date, customers(name), order_items(qty, products(name, unit))')
      .is('fulfilled_at', null)
      .in('target_fulfilment_date', window),
    admin
      .from('events')
      .select('id, name, starts_on, ends_on, lead_weeks, active')
      .eq('active', true)
      .gt('starts_on', date),
  ]);
  if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`);
  if (eventsRes.error) throw new Error(`events: ${eventsRes.error.message}`);
  const orders: DueOrder[] = ((ordersRes.data ?? []) as unknown as RawOrder[]).map((r) => ({
    id: r.id,
    ordered_at: r.ordered_at,
    target_fulfilment_date: r.target_fulfilment_date,
    customer_name: r.customers?.name ?? '(unknown customer)',
    items: (r.order_items ?? []).map((i) => ({
      product_name: i.products?.name ?? '?',
      unit: i.products?.unit ?? '',
      qty: Number(i.qty),
    })),
  }));
  return { orders, events: eventsRes.data ?? [] };
}

async function dropAlreadySentEvents(payloads: PushPayload[]): Promise<PushPayload[]> {
  const eventRefs = payloads.filter((p) => p.kind === 'event_lead').map((p) => p.ref);
  if (eventRefs.length === 0) return payloads;
  const { data, error } = await admin
    .from('notification_log')
    .select('ref')
    .eq('kind', 'event_lead')
    .in('ref', eventRefs);
  if (error) throw new Error(`notification_log: ${error.message}`);
  const sent = new Set((data ?? []).map((r: { ref: string }) => r.ref));
  return payloads.filter((p) => !(p.kind === 'event_lead' && sent.has(p.ref)));
}

async function claim(p: PushPayload): Promise<boolean> {
  const { data, error } = await admin
    .from('notification_log')
    .upsert({ kind: p.kind, ref: p.ref }, { onConflict: 'kind,ref', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`claim ${p.kind}/${p.ref}: ${error.message}`);
  return (data ?? []).length > 0;
}

async function run(body: { date?: string; dryRun?: boolean; force?: boolean }) {
  const date = body.date && YMD.test(body.date) ? body.date : todayIST();
  const { orders, events } = await loadInputs(date);
  const payloads = body.force ? buildRunPayloads(date, orders, events) : await dropAlreadySentEvents(buildRunPayloads(date, orders, events));
  if (body.dryRun) return { date, dryRun: true, payloads };

  const { data: subs, error: subsErr } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (subsErr) throw new Error(`push_subscriptions: ${subsErr.message}`);
  // With no devices, don't consume one-off event alerts in the log.
  if (!subs || subs.length === 0) return { date, payloads: payloads.length, sent: 0, removed: 0, errors: [], note: 'no subscriptions' };

  const { keys } = await ensureKeys();
  const server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: keys });
  let sent = 0;
  const removed = new Set<string>();
  const errors: string[] = [];

  for (const p of payloads) {
    if (!body.force && !(await claim(p))) continue;
    const message = JSON.stringify({ title: p.title, body: p.body, url: p.url, tag: p.kind });
    for (const s of subs) {
      if (removed.has(s.id)) continue;
      try {
        await server
          .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(message, { ttl: 86400, urgency: webpush.Urgency.High });
        sent++;
      } catch (e) {
        const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
        if (status === 404 || status === 410) {
          removed.add(s.id);
          await admin.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          errors.push(`${p.kind} → ${new URL(s.endpoint).host}: ${status || (e as Error).message}`);
        }
      }
    }
  }
  return { date, payloads: payloads.length, sent, removed: removed.size, errors };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  try {
    if (body.action === 'ensure-keys') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return json({ error: 'unauthorized' }, 401);
      const { publicKey } = await ensureKeys();
      return json({ publicKey });
    }

    if (body.action === 'run') {
      const { data: secret, error } = await admin.rpc('reminders_cron_secret');
      if (error || !secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);
      return json(await run(body as { date?: string; dryRun?: boolean; force?: boolean }));
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

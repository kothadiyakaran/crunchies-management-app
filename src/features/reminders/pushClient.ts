import { supabase } from '@/lib/supabase';

export type ReminderState = 'unsupported' | 'blocked' | 'off' | 'on';

export function urlBase64ToUint8Array(s: string): Uint8Array {
  const padded = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function supported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof window.PushManager !== 'undefined' &&
    typeof Notification !== 'undefined'
  );
}

// getRegistration() is immediate but undefined until the worker registers on
// first load; ready never settles where no worker exists (e.g. `npm run dev`).
async function registration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
}

function sameKey(current: ArrayBuffer | null, key: Uint8Array): boolean {
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

async function serverKey(createIfMissing: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_vapid_public_key');
  if (error) throw new Error(error.message);
  if (data) return data;
  if (!createIfMissing) return null;
  const res = await supabase.functions.invoke('send-reminders', { body: { action: 'ensure-keys' } });
  if (res.error) throw new Error(res.error.message);
  return (res.data as { publicKey: string }).publicKey;
}

async function save(sub: PushSubscription): Promise<void> {
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: j.keys?.p256dh ?? '',
      auth: j.keys?.auth ?? '',
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(error.message);
}

async function subscribe(reg: ServiceWorkerRegistration, key: Uint8Array): Promise<PushSubscription> {
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
}

export async function getReminderState(): Promise<ReminderState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Must run from a tap: Android only shows the permission prompt after a user gesture. */
export async function enableReminders(): Promise<ReminderState> {
  if (!supported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'off';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const keyText = await serverKey(true);
  if (!keyText) throw new Error('Reminder key unavailable');
  const key = urlBase64ToUint8Array(keyText);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await subscribe(reg, key);
  await save(sub);
  return 'on';
}

export async function disableReminders(): Promise<void> {
  if (!supported()) return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** On app open: follow a rotated server key and mark this device as still in use. */
export async function refreshSubscription(): Promise<void> {
  if ((await getReminderState()) !== 'on') return;
  const reg = await registration();
  let sub = await reg?.pushManager.getSubscription();
  if (!reg || !sub) return;
  const keyText = await serverKey(false);
  if (!keyText) return;
  const key = urlBase64ToUint8Array(keyText);
  if (!sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = await subscribe(reg, key);
  }
  await save(sub);
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
const upsert = vi.fn();
const deleteEq = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({
      upsert: (...a: unknown[]) => upsert(...a),
      delete: () => ({ eq: (...a: unknown[]) => deleteEq(...a) }),
    }),
  },
}));

import {
  disableReminders,
  enableReminders,
  getReminderState,
  refreshSubscription,
  urlBase64ToUint8Array,
} from './pushClient';

const KEY = 'BOrB5tq-3dbx3JmGPavMwGDSwzLIA7lJkdKp7o4ZLlJ8'; // any base64url
const OTHER_KEY = 'AAAA';

type FakeSub = {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
};

function fakeSub(key: string): FakeSub {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    options: { applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer },
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

let current: FakeSub | null;
const subscribe = vi.fn(async (opts: { applicationServerKey: Uint8Array }) => {
  const k = opts.applicationServerKey;
  current = {
    ...fakeSub(KEY),
    options: { applicationServerKey: k.buffer.slice(k.byteOffset, k.byteOffset + k.byteLength) as ArrayBuffer },
  };
  return current;
});

function install({ permission = 'default', supported = true }: { permission?: NotificationPermission; supported?: boolean }) {
  const registration = {
    pushManager: { getSubscription: vi.fn(async () => current), subscribe },
  };
  if (supported) {
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn(async () => registration), ready: Promise.resolve(registration) },
    });
  } else {
    vi.stubGlobal('PushManager', undefined);
    delete (window as { PushManager?: unknown }).PushManager;
  }
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn(async () => permission === 'default' ? 'granted' : permission),
  });
}

beforeEach(() => {
  current = null;
  rpc.mockReset();
  invoke.mockReset();
  upsert.mockReset().mockResolvedValue({ error: null });
  deleteEq.mockReset().mockResolvedValue({ error: null });
  subscribe.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    expect([...urlBase64ToUint8Array('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});

describe('getReminderState', () => {
  it('is unsupported without the Push API', async () => {
    install({ supported: false });
    expect(await getReminderState()).toBe('unsupported');
  });
  it('is blocked when permission was denied', async () => {
    install({ permission: 'denied' });
    expect(await getReminderState()).toBe('blocked');
  });
  it('is off without a subscription', async () => {
    install({ permission: 'granted' });
    expect(await getReminderState()).toBe('off');
  });
  it('is on with a subscription and permission', async () => {
    install({ permission: 'granted' });
    current = fakeSub(KEY);
    expect(await getReminderState()).toBe('on');
  });
});

describe('enableReminders', () => {
  it('asks permission, subscribes with the server key and saves the row', async () => {
    install({ permission: 'default' });
    rpc.mockResolvedValue({ data: KEY, error: null });
    expect(await enableReminders()).toBe('on');
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' }),
      { onConflict: 'endpoint' },
    );
  });

  it('creates the key pair through the function on first use', async () => {
    install({ permission: 'granted' });
    rpc.mockResolvedValue({ data: null, error: null });
    invoke.mockResolvedValue({ data: { publicKey: KEY }, error: null });
    expect(await enableReminders()).toBe('on');
    expect(invoke).toHaveBeenCalledWith('send-reminders', { body: { action: 'ensure-keys' } });
  });

  it('returns blocked when the user denies permission', async () => {
    install({ permission: 'denied' });
    expect(await enableReminders()).toBe('blocked');
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe('disableReminders', () => {
  it('deletes the row and unsubscribes', async () => {
    install({ permission: 'granted' });
    const sub = fakeSub(KEY);
    current = sub;
    await disableReminders();
    expect(deleteEq).toHaveBeenCalledWith('endpoint', sub.endpoint);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
});

describe('refreshSubscription', () => {
  it('re-subscribes when the server key changed', async () => {
    install({ permission: 'granted' });
    const old = fakeSub(OTHER_KEY);
    current = old;
    rpc.mockResolvedValue({ data: KEY, error: null });
    await refreshSubscription();
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
  });

  it('only bumps last_seen when the key matches', async () => {
    install({ permission: 'granted' });
    current = fakeSub(KEY);
    rpc.mockResolvedValue({ data: KEY, error: null });
    await refreshSubscription();
    expect(subscribe).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
  });

  it('does nothing when reminders are off', async () => {
    install({ permission: 'granted' });
    await refreshSubscription();
    expect(rpc).not.toHaveBeenCalled();
  });
});

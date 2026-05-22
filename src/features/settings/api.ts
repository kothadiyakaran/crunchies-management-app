// Settings API — read/write the single-row `business_settings` table.
// Sprint 9 T9.1. Replaces the constants in src/lib/business.ts; the consumer-facing
// shape (`BusinessInfo`) mirrors that file exactly so callers can be swapped 1:1.
//
// NOTE: supabase-js client type assertions (`as never`, `as unknown as ...`) are
// used at the boundary until `database.types.ts` is regenerated (the migration
// 0007 creates the table + RPC; regen happens after apply). Same pattern as the
// existing public/api.ts wrappers around the 0005 RPCs.

import { supabase } from '@/lib/supabase';
import type { BusinessInfo } from '@/lib/business';

export type { BusinessInfo };

// Raw row shape as stored in Postgres (snake_case).
export type BusinessSettings = {
  id: string;
  name: string;
  tagline: string | null;
  address_lines: string[];
  gst_line: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  bill_footer: string;
  signature_line: string;
  updated_at: string;
};

// Mapper: snake_case DB row -> camelCase BusinessInfo (matches src/lib/business.ts).
export function toBusinessInfo(row: BusinessSettings): BusinessInfo {
  return {
    name: row.name,
    tagline: row.tagline,
    addressLines: row.address_lines ?? [],
    gstLine: row.gst_line,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    billFooter: row.bill_footer,
    signatureLine: row.signature_line,
  };
}

// Inverse mapper: camelCase patch -> snake_case patch for Supabase update.
function toRowPatch(patch: Partial<BusinessInfo>): Partial<BusinessSettings> {
  const out: Partial<BusinessSettings> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.tagline !== undefined) out.tagline = patch.tagline;
  if (patch.addressLines !== undefined) out.address_lines = patch.addressLines;
  if (patch.gstLine !== undefined) out.gst_line = patch.gstLine;
  if (patch.phone !== undefined) out.phone = patch.phone;
  if (patch.whatsapp !== undefined) out.whatsapp = patch.whatsapp;
  if (patch.email !== undefined) out.email = patch.email;
  if (patch.billFooter !== undefined) out.bill_footer = patch.billFooter;
  if (patch.signatureLine !== undefined) out.signature_line = patch.signatureLine;
  return out;
}

// Fetch the single business_settings row.
export async function getSettings(): Promise<BusinessInfo> {
  // Cast through `never` because business_settings is not yet in the generated
  // Database types — regenerate via mcp__supabase__generate_typescript_types
  // after applying migration 0007 to drop this assertion.
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        limit: (n: number) => {
          single: () => Promise<{ data: BusinessSettings | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from('business_settings')
    .select('*')
    .limit(1)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'business_settings not found');
  return toBusinessInfo(data);
}

// Patch the single business_settings row. Fetches the id first so the update
// has an explicit where clause (supabase-js requires one).
export async function updateSettings(patch: Partial<BusinessInfo>): Promise<BusinessInfo> {
  type SettingsClient = {
    from: (t: string) => {
      select: (cols: string) => {
        limit: (n: number) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
      update: (p: Partial<BusinessSettings>) => {
        eq: (col: string, val: string) => {
          select: (cols: string) => {
            single: () => Promise<{ data: BusinessSettings | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
  const client = supabase as unknown as SettingsClient;

  const { data: existing, error: selErr } = await client
    .from('business_settings')
    .select('id')
    .limit(1)
    .single();
  if (selErr || !existing) throw new Error(selErr?.message ?? 'business_settings not found');

  const rowPatch = toRowPatch(patch);
  // Always bump updated_at on any write.
  (rowPatch as { updated_at?: string }).updated_at = new Date().toISOString();

  const { data, error } = await client
    .from('business_settings')
    .update(rowPatch)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'business_settings update failed');
  return toBusinessInfo(data);
}

// Anon-callable subset used by the public exhibition form. Returns the single
// row via the SECURITY DEFINER RPC (anon has no direct table access).
export async function getPublicBusinessIdentity(): Promise<{
  name: string;
  tagline: string | null;
  whatsapp: string | null;
}> {
  // RPC name not yet in generated types until regen — same pattern as public/api.ts
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
  ) => Promise<{
    data: { name: string; tagline: string | null; whatsapp: string | null }[] | null;
    error: { message: string } | null;
  }>)('public_get_business_identity');
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const first = rows[0];
  if (!first) {
    throw new Error('business identity not found');
  }
  return first;
}

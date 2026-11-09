import { supabase } from './supabase';
import { compressImage } from './imageCompression';

/** Shops directory: suppliers of parts, sails and gear, grouped into categories. */

export type ShopAccent = 'blue' | 'violet' | 'pink' | 'orange' | 'green' | 'teal';
export type ShopIcon = 'bag' | 'sail' | 'wrench' | 'radio' | 'boat' | 'tag' | 'battery' | 'box';

export interface ShopCategory {
  id: string;
  name: string;
  description: string | null;
  icon: ShopIcon;
  accent: ShopAccent;
  sort_order: number;
  is_active: boolean;
}

export interface ShopSupplier {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  website_url: string | null;
  logo_url: string | null;
  cover_url: string | null;
  brand_color: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  ships_to: string | null;
  boat_classes: string[];
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  visit_count: number;
  categoryIds: string[];
}

export type ShopSupplierInput = Omit<ShopSupplier, 'id' | 'visit_count'> & { id?: string };
export type ShopCategoryInput = Omit<ShopCategory, 'id'> & { id?: string };

export const SHOP_ACCENTS: Record<ShopAccent, { fg: string; bg: string; label: string }> = {
  blue:   { fg: '#4DA3FF', bg: 'rgba(10,132,255,.15)',  label: 'Blue' },
  violet: { fg: '#B08CFF', bg: 'rgba(138,77,255,.16)',  label: 'Violet' },
  pink:   { fg: '#FF7DB8', bg: 'rgba(255,62,154,.14)',  label: 'Pink' },
  orange: { fg: '#FFA65C', bg: 'rgba(255,138,43,.15)',  label: 'Orange' },
  green:  { fg: '#5FD47F', bg: 'rgba(52,199,89,.14)',   label: 'Green' },
  teal:   { fg: '#4FD6CF', bg: 'rgba(20,184,166,.15)',  label: 'Teal' },
};

export const SHOP_CLASSES = ['IOM', '10R', 'Marblehead', 'A Class', 'DF65', 'DF95', 'RC Laser', 'RG65', 'EC12', 'Footy'];

/** Everything members can see, in display order. Super admins also get hidden rows. */
export async function loadShops(): Promise<{ categories: ShopCategory[]; suppliers: ShopSupplier[] }> {
  const [cats, sups, links] = await Promise.all([
    supabase.from('shop_categories').select('*').order('sort_order').order('name'),
    supabase.from('shop_suppliers').select('*').order('sort_order').order('name'),
    supabase.from('shop_supplier_categories').select('supplier_id, category_id'),
  ]);
  if (cats.error) throw cats.error;
  if (sups.error) throw sups.error;
  const bySupplier = new Map<string, string[]>();
  for (const l of links.data || []) {
    const arr = bySupplier.get(l.supplier_id) || [];
    arr.push(l.category_id);
    bySupplier.set(l.supplier_id, arr);
  }
  return {
    categories: (cats.data || []) as ShopCategory[],
    suppliers: (sups.data || []).map((s: any) => ({ ...s, boat_classes: s.boat_classes || [], categoryIds: bySupplier.get(s.id) || [] })),
  };
}

/** Full URL with a scheme, or null. */
export function shopUrl(url: string | null | undefined): string | null {
  const u = (url || '').trim();
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** "bergansails.shop" from "https://www.bergansails.shop/". */
export function shopDomain(url: string | null | undefined): string {
  const u = shopUrl(url);
  if (!u) return '';
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
}

/** A supplier's brand colour, or a stable colour picked from its name. */
export function shopColor(s: Pick<ShopSupplier, 'name' | 'brand_color'>): string {
  if (s.brand_color && /^#[0-9a-f]{6}$/i.test(s.brand_color)) return s.brand_color;
  const palette = ['#0A84FF', '#8A4DFF', '#FF3E9A', '#FF8A2B', '#22B455', '#14B8A6', '#E5484D', '#3B5BDB'];
  let h = 0;
  for (const ch of s.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mesh-gradient banner from a brand colour (used when a supplier has no banner image). */
export function shopMesh(color: string, light = false): string {
  const [r, g, b] = hexToRgb(color);
  const c = (a: number) => `rgba(${r},${g},${b},${a})`;
  // lift very dark brand colours so the banner still glows
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const lift = lum < 0.3 ? 0.35 : 0;
  const base = light ? '#F4F7FC' : '#0B1120';
  return [
    `radial-gradient(70% 90% at 85% 15%, rgba(255,62,154,${light ? 0.22 : 0.38}) 0%, transparent 60%)`,
    `radial-gradient(60% 80% at 100% 100%, rgba(255,138,43,${light ? 0.14 : 0.22 + lift / 2}) 0%, transparent 65%)`,
    `radial-gradient(80% 90% at 55% 0%, rgba(138,77,255,${light ? 0.2 : 0.3 + lift}) 0%, transparent 70%)`,
    `radial-gradient(120% 120% at 0% 0%, ${c(light ? 0.75 : 1)} 0%, ${c(light ? 0.35 : 0.55)} 40%, transparent 75%)`,
    `linear-gradient(135deg, ${c(light ? 0.4 : 0.7)}, ${base} 85%)`,
  ].join(', ');
}

export function shopInitials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || '?';
}

/** Counts a "Visit shop" tap (best effort, never blocks opening the site). */
export function recordShopVisit(supplierId: string): void {
  supabase.rpc('record_shop_visit', { p_supplier: supplierId }).then(() => {}, () => {});
}

// ─── Management (super admins) ───────────────────────────────────────────────

export async function saveShopSupplier(input: ShopSupplierInput, userId?: string): Promise<string> {
  const { id, categoryIds, ...fields } = input;
  const row = {
    ...fields,
    name: fields.name.trim(),
    website_url: shopUrl(fields.website_url),
    boat_classes: fields.boat_classes || [],
  };
  let supplierId = id;
  if (supplierId) {
    const { error } = await supabase.from('shop_suppliers').update(row).eq('id', supplierId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('shop_suppliers').insert({ ...row, created_by: userId || null }).select('id').single();
    if (error) throw error;
    supplierId = data.id as string;
  }
  const del = await supabase.from('shop_supplier_categories').delete().eq('supplier_id', supplierId);
  if (del.error) throw del.error;
  if (categoryIds.length) {
    const ins = await supabase.from('shop_supplier_categories').insert(categoryIds.map(category_id => ({ supplier_id: supplierId, category_id })));
    if (ins.error) throw ins.error;
  }
  return supplierId!;
}

export async function deleteShopSupplier(id: string): Promise<void> {
  const { error } = await supabase.from('shop_suppliers').delete().eq('id', id);
  if (error) throw error;
}

export async function updateShopSupplier(id: string, fields: Partial<Pick<ShopSupplier, 'is_active' | 'is_featured' | 'sort_order'>>): Promise<void> {
  const { error } = await supabase.from('shop_suppliers').update(fields).eq('id', id);
  if (error) throw error;
}

export async function saveShopCategory(input: ShopCategoryInput): Promise<string> {
  const { id, ...fields } = input;
  const row = { ...fields, name: fields.name.trim() };
  if (id) {
    const { error } = await supabase.from('shop_categories').update(row).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('shop_categories').insert(row).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteShopCategory(id: string): Promise<void> {
  const { error } = await supabase.from('shop_categories').delete().eq('id', id);
  if (error) throw error;
}

/** Saves a new order (index = sort_order) for categories or suppliers. */
export async function reorderShop(table: 'shop_categories' | 'shop_suppliers', ids: string[]): Promise<void> {
  await Promise.all(ids.map((id, i) => supabase.from(table).update({ sort_order: i + 1 }).eq('id', id)));
}

export async function uploadShopImage(file: File, kind: 'logo' | 'cover' = 'logo'): Promise<string> {
  const isSvg = file.type === 'image/svg+xml';
  const blob: Blob = isSvg ? file : await compressImage(file, kind === 'logo' ? 'logo' : 'banner').catch(() => file);
  const ext = isSvg ? 'svg' : (blob.type.split('/')[1] || file.name.split('.').pop() || 'png').replace('jpeg', 'jpg');
  const path = `shops/${kind}s/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: blob.type || file.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

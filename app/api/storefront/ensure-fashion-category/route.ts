import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { verifyAuth } from '@/lib/auth';
import { FASHION_CATEGORY_SLUG, FASHION_HERO_IMAGE } from '@/lib/fashion';

export const dynamic = 'force-dynamic';

/**
 * POST /api/storefront/ensure-fashion-category
 * Anyone: reports whether the Fashion category exists (never writes).
 * Admin/staff bearer: creates it when it is missing.
 * 200 → { success, created, category | null }
 */
export async function POST(request: Request) {
  const supabase = createServerSupabase('service');

  const { data: existing, error: lookupError } = await supabase
    .from('categories')
    .select('id, slug, name')
    .eq('slug', FASHION_CATEGORY_SLUG)
    .maybeSingle();

  if (lookupError) {
    console.error('[ensure-fashion-category] lookup failed:', lookupError.message);
    return NextResponse.json({ success: false, message: 'Could not check the category' }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ success: true, created: false, category: existing });
  }

  // Creating catalogue data is a staff action.
  const auth = request.headers.get('authorization')
    ? await verifyAuth(request, { requireRole: ['admin', 'staff'] })
    : { authenticated: false };
  if (!auth.authenticated) {
    return NextResponse.json({ success: true, created: false, category: null });
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({
      name: 'Fashion',
      slug: FASHION_CATEGORY_SLUG,
      description: 'Streetwear collection — tops, trousers and everyday style.',
      image_url: FASHION_HERO_IMAGE,
      status: 'active',
      position: 0,
      metadata: { featured: true },
    })
    .select('id, slug, name')
    .single();

  if (error) {
    console.error('[ensure-fashion-category] insert failed:', error.message);
    return NextResponse.json({ success: false, message: 'Could not create the category' }, { status: 500 });
  }

  return NextResponse.json({ success: true, created: true, category: data });
}

export async function GET(request: Request) {
  return POST(new Request(request.url, { method: 'POST' }));
}

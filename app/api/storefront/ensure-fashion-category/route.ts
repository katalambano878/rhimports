import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FASHION_CATEGORY_SLUG, FASHION_HERO_IMAGE } from '@/lib/fashion';

export const dynamic = 'force-dynamic';

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !(serviceKey || anonKey)) {
    return NextResponse.json({ success: false, message: 'Supabase is not configured' }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey || anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: lookupError } = await supabase
    .from('categories')
    .select('id, slug, name')
    .eq('slug', FASHION_CATEGORY_SLUG)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ success: false, message: lookupError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ success: true, created: false, category: existing });
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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, created: true, category: data });
}

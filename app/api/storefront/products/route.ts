import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

// Server-side Supabase client (no auth needed for public data)
const supabase = createServerSupabase('anon');

// Simple in-memory cache
// Simple in-memory cache: bounded number of keys, each with its own timestamp.
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes — products don't change frequently
const CACHE_MAX_KEYS = 20;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured') === 'true';
    const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 50;

    // Build a cache key from params (category is not applied as a filter, so not part of the key)
    const cacheKey = `${featured}-${limit}`;

    // Check cache (only for featured/home requests — general shop is more dynamic)
    const hit = featured ? cache.get(cacheKey) : undefined;
    if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
        return NextResponse.json(hit.data, {
            headers: {
                'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
                'X-Cache': 'HIT'
            }
        });
    }

    try {
        let query = supabase
            .from('products')
            .select(`
                id, name, slug, price, compare_at_price, quantity, description, metadata, brand, vendor,
                categories(id, name, slug),
                product_images(url, position),
                product_variants(id, name, price, quantity)
            `)
            .order('created_at', { ascending: false });

        // Always filter active products
        query = query.eq('status', 'active');

        if (featured) query = query.eq('featured', true);
        query = query.limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error('[Storefront API] Products error:', error.message);
            return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
        }

        // Cache the result (featured only; bounded)
        if (featured) {
            if (!cache.has(cacheKey) && cache.size >= CACHE_MAX_KEYS) {
                const oldest = cache.keys().next().value;
                if (oldest !== undefined) cache.delete(oldest);
            }
            cache.set(cacheKey, { data, timestamp: Date.now() });
        }

        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
                'X-Cache': 'MISS'
            }
        });
    } catch (err: any) {
        console.error('[Storefront API] Error:', err?.message || err);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}

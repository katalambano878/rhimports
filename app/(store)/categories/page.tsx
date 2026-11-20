import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import ScrollReveal from '@/components/ScrollReveal';
import { formatPrice } from '@/lib/formatCurrency';
import { DEFAULT_CONTACT_PHONE } from '@/lib/contact';

export const revalidate = 0;

const CURRENCY_SYMBOL = 'GH₵';

// Editorial accent palette to give each card subtle visual identity
const ACCENTS = [
  { dot: 'bg-amber-400',  ring: 'ring-amber-200/40',  label: 'text-amber-300' },
  { dot: 'bg-emerald-400', ring: 'ring-emerald-200/40', label: 'text-emerald-300' },
  { dot: 'bg-sky-400',     ring: 'ring-sky-200/40',     label: 'text-sky-300' },
  { dot: 'bg-rose-400',    ring: 'ring-rose-200/40',    label: 'text-rose-300' },
  { dot: 'bg-violet-400',  ring: 'ring-violet-200/40',  label: 'text-violet-300' },
  { dot: 'bg-orange-400',  ring: 'ring-orange-200/40',  label: 'text-orange-300' },
];

export default async function CategoriesPage() {
  // ── Data fetching ────────────────────────────────────────────────
  const [categoriesRes, productsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, slug, description, image_url, position')
      .eq('status', 'active')
      .order('position', { ascending: true }),
    supabase
      .from('products')
      .select('category_id, price')
      .eq('status', 'active'),
  ]);

  const loadFailed = !!categoriesRes.error;
  const allCategories = categoriesRes.data || [];
  const allProducts = productsRes.data || [];

  // ── Aggregate per-category stats ────────────────────────────────
  const stats = new Map<string, { count: number; minPrice: number | null }>();
  for (const p of allProducts as any[]) {
    if (!p.category_id) continue;
    const cur = stats.get(p.category_id) || { count: 0, minPrice: null };
    cur.count += 1;
    const price = Number(p.price);
    if (!Number.isNaN(price) && price > 0) {
      cur.minPrice = cur.minPrice == null ? price : Math.min(cur.minPrice, price);
    }
    stats.set(p.category_id, cur);
  }

  const totalProducts = allProducts.length;
  const totalCategories = allCategories.length;

  const waPhone = DEFAULT_CONTACT_PHONE.replace(/\s/g, '').replace(/^0/, '');
  const waHref = `https://wa.me/233${waPhone}`;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      {/* ══════════════════════════════════════════════════════════
          1 · HERO — premium editorial
      ══════════════════════════════════════════════════════════ */}
      <section className="relative text-white overflow-hidden min-h-[52vh] sm:min-h-[46vh] lg:min-h-[min(520px,55vh)] flex flex-col">
        {/* Full-bleed hero image */}
        <div className="absolute inset-0">
          <Image
            src="/images/gallery/sourcing-partners.png"
            alt="Supplier partnerships and international sourcing — RNH Imports collections"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
        {/* Readability: vignette + left emphasis + bottom depth */}
        <div className="absolute inset-0 bg-[#0B1230]/35 pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, #0B1230 0%, rgba(11,18,48,0.88) 38%, rgba(11,18,48,0.35) 72%, rgba(11,18,48,0.2) 100%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1230]/90 via-[#0B1230]/25 to-[#0B1230]/55 pointer-events-none" />
        {/* Subtle dot grid on top */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.12] mix-blend-overlay">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.7) 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex-1 flex flex-col justify-end pt-16 lg:pt-20 pb-6 lg:pb-8">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/25 border border-white/15 backdrop-blur-md text-[10px] font-bold tracking-[0.22em] uppercase text-white/90 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              All Collections
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight mb-3 drop-shadow-lg">
              Every category.<br />
              <span className="italic text-white/85">Every device.</span>
            </h1>
            <p className="text-sm sm:text-base text-white/80 max-w-xl font-light leading-relaxed drop-shadow-md">
              From premium smartphones and laptops to gaming gear, cameras and audio — explore RNH Imports' complete catalogue, sourced direct from the world's leading manufacturers.
            </p>
          </div>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/15 max-w-3xl bg-white/5 backdrop-blur-md">
            {[
              { label: 'Categories', value: totalCategories.toString().padStart(2, '0') },
              { label: 'Products',   value: totalProducts > 0 ? totalProducts.toLocaleString() : '—' },
              { label: 'Sourcing',   value: 'Direct' },
              { label: 'Delivery',   value: 'Ghana-wide' },
            ].map((s) => (
              <div key={s.label} className="bg-black/35 px-4 py-4 backdrop-blur-sm">
                <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/50 mb-1.5">{s.label}</p>
                <p className="font-serif text-2xl sm:text-[26px] text-white leading-none">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          2 · QUICK NAV CHIPS — jump links
      ══════════════════════════════════════════════════════════ */}
      {allCategories.length > 0 && (
        <div className="sticky top-14 z-30 bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400 mr-2 hidden sm:inline">
                Jump to
              </span>
              {allCategories.map((c) => (
                <a
                  key={c.id}
                  href={`#cat-${c.slug}`}
                  className="px-4 py-1.5 rounded-full bg-gray-100 hover:bg-gray-900 hover:text-white text-gray-700 text-xs font-semibold whitespace-nowrap transition-colors"
                >
                  {c.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          3 · BENTO GRID — categories
      ══════════════════════════════════════════════════════════ */}
      <section className="pt-4 lg:pt-6 pb-16 lg:pb-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {allCategories.length > 0 ? (
            <div className="grid grid-cols-12 auto-rows-[200px] sm:auto-rows-[220px] gap-3 lg:gap-4">
              {allCategories.map((category, index) => {
                const accent = ACCENTS[index % ACCENTS.length];
                const stat = stats.get(category.id) || { count: 0, minPrice: null };
                const cardSpan = 'col-span-6 lg:col-span-4';

                const fallback =
                  'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop';

                return (
                  <Link
                    id={`cat-${category.slug}`}
                    key={category.id}
                    href={`/shop?category=${category.slug}`}
                    className={`group relative ${cardSpan} block overflow-hidden rounded-2xl bg-gray-900 ring-1 ring-black/5 hover:ring-black/15 hover:shadow-[0_24px_50px_-22px_rgba(15,26,71,0.35)] transition-all duration-500 scroll-mt-32`}
                  >
                    {/* Image */}
                    <Image
                      src={category.image_url || fallback}
                      alt={category.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-110"
                    />

                    {/* Gradients */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent opacity-60" />

                    {/* Top-left badge: number + collection label */}
                    <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${accent.dot} shadow-[0_0_12px] ${accent.ring}`} />
                        <span className={`text-[10px] font-bold tracking-[0.22em] uppercase ${accent.label}`}>
                          Collection
                        </span>
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-white/40 tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                        <span className="mx-1 text-white/20">/</span>
                        {String(allCategories.length).padStart(2, '0')}
                      </span>
                    </div>

                    {/* Stat chip — top right (under counter) */}
                    {stat.count > 0 && (
                      <div className="absolute top-12 right-4 inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/15 rounded-full px-2.5 py-1">
                        <i className="ri-shopping-bag-3-line text-[11px] text-white/70" />
                        <span className="text-[11px] font-semibold text-white/85">
                          {stat.count} {stat.count === 1 ? 'product' : 'products'}
                        </span>
                      </div>
                    )}

                    {/* Bottom content */}
                    <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5 text-white">
                      <h3
                        className="font-serif leading-[1.05] mb-1.5 transition-transform duration-500 group-hover:-translate-y-1 text-2xl sm:text-[30px]"
                      >
                        {category.name}
                      </h3>

                      <p
                        className="text-white/70 font-light leading-relaxed mb-3 line-clamp-2 text-xs sm:text-sm"
                      >
                        {category.description ||
                          `Genuine ${category.name.toLowerCase()} sourced direct from manufacturers — verified, sealed, and ready to ship across Ghana.`}
                      </p>

                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-white border-b border-white/30 pb-0.5 group-hover:border-white group-hover:gap-2.5 transition-all">
                          <span>Explore Collection</span>
                          <i className="ri-arrow-right-line transition-transform group-hover:translate-x-1" />
                        </div>

                        {stat.minPrice && (
                          <span className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">
                            From <span className="text-white">{formatPrice(stat.minPrice, CURRENCY_SYMBOL)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Subtle corner mark */}
                    <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity">
                      <div className="absolute top-5 right-5 w-1 h-1 rounded-full bg-white" />
                      <div className="absolute top-5 right-9 w-1 h-1 rounded-full bg-white" />
                      <div className="absolute top-9 right-5 w-1 h-1 rounded-full bg-white" />
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-32 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <i className="ri-store-2-line text-4xl text-gray-300" aria-hidden="true" />
              </div>
              {loadFailed ? (
                <>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Couldn&apos;t load collections</h3>
                  <p className="text-gray-500 mb-6">Please try again in a moment.</p>
                  <a
                    href="/categories"
                    className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#0F1A47] transition-all"
                  >
                    Try again
                  </a>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No collections yet</h3>
                  <p className="text-gray-500">Check back soon for new arrivals.</p>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          4 · WHY SHOP BY CATEGORY — mini editorial row
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 bg-stone-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal direction="up" className="grid sm:grid-cols-3 gap-8 lg:gap-12">
            {[
              {
                num: '01',
                icon: 'ri-search-eye-line',
                title: 'Browse with confidence',
                body: 'Each category is curated — only verified, genuine products from trusted sources make it onto the shelf.',
              },
              {
                num: '02',
                icon: 'ri-flashlight-line',
                title: 'Compare side-by-side',
                body: 'Drill into a collection to see specs, prices and stock across models — no guesswork, no markup gimmicks.',
              },
              {
                num: '03',
                icon: 'ri-customer-service-2-line',
                title: 'Talk to a real human',
                body: 'Stuck between two models? Ping us on WhatsApp. We give honest advice, not a sales pitch.',
              },
            ].map((step) => (
              <div key={step.num} className="group">
                <div className="flex items-start gap-4 mb-4">
                  <span className="font-mono text-xs font-bold tracking-widest text-primary tabular-nums">{step.num}</span>
                  <div className="h-px flex-1 bg-gray-200 mt-2 group-hover:bg-primary transition-colors duration-500" />
                </div>
                <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary transition-colors duration-300">
                  <i className={`${step.icon} text-xl text-primary group-hover:text-white transition-colors`} />
                </div>
                <h3 className="font-serif text-xl text-gray-900 mb-2 leading-tight">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed font-light">{step.body}</p>
              </div>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          5 · CONTACT CTA — RNH voice
      ══════════════════════════════════════════════════════════ */}
      <section className="py-14 lg:py-16 px-4 sm:px-6 bg-white">
        <ScrollReveal direction="scale" className="max-w-5xl mx-auto">
          <div className="relative rounded-2xl bg-gradient-to-br from-[#1B2A6B] via-[#0F1A47] to-black overflow-hidden shadow-2xl shadow-[#1B2A6B]/20 p-6 sm:p-8 lg:p-10 border border-white/5">
            <div className="absolute top-0 right-0 w-[28rem] h-[28rem] -translate-y-1/3 translate-x-1/4 rounded-full bg-primary/30 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[22rem] h-[22rem] translate-y-1/3 -translate-x-1/4 rounded-full bg-[#25D366]/15 blur-[80px] pointer-events-none" />

            <div className="relative z-10 grid lg:grid-cols-5 gap-6 lg:gap-8 items-center">
              <div className="lg:col-span-3">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                  <span className="text-white/80 text-[10px] font-bold tracking-[0.22em] uppercase">We're Online</span>
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl text-white mb-3 leading-[1.05]">
                  Can't decide between <span className="italic text-white/70">two models?</span>
                </h2>
                <p className="text-white/60 text-sm sm:text-base font-light leading-relaxed max-w-lg">
                  Tell us your budget and use-case — our team will recommend the right device, source it directly, and ship it to your door anywhere in Ghana.
                </p>
              </div>

              <div className="lg:col-span-2 flex flex-col gap-3">
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-[1.02] shadow-xl shadow-[#25D366]/20 group"
                >
                  <i className="ri-whatsapp-line text-xl group-hover:rotate-12 transition-transform" />
                  Chat on WhatsApp
                </a>
                <Link
                  href="/shop"
                  className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white px-6 py-3 rounded-full font-semibold text-sm transition-all backdrop-blur-sm"
                >
                  <i className="ri-search-line text-base" />
                  Browse All Products
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs font-semibold tracking-wider uppercase mt-0.5 transition-colors"
                >
                  Or send us an email
                  <i className="ri-arrow-right-line" />
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}

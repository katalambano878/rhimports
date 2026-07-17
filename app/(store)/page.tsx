'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import { usePageTitle } from '@/hooks/usePageTitle';
import { motion, AnimatePresence } from 'framer-motion';
import { HERO_SLIDES_HOME } from '@/lib/hero-images';
import { DEFAULT_CONTACT_PHONE } from '@/lib/contact';

// ── Static data (no DB dependency) ─────────────────────────────────────────

const BRANDS = [
  'Apple', 'Sony', 'Samsung', 'Beats', 'Bose', 'Xbox', 'Nintendo',
  'DJI', 'Canon', 'Fujifilm', 'Dell', 'HP', 'Lenovo', 'LG', 'JBL',
];

const FALLBACK_CATEGORIES = [
  { id: 'l', name: 'Laptops',      slug: 'laptops',      icon: 'ri-laptop-line',        bg: 'from-blue-900 to-blue-950' },
  { id: 'p', name: 'Phones',       slug: 'smartphones',  icon: 'ri-smartphone-line',    bg: 'from-slate-700 to-slate-900' },
  { id: 't', name: 'Tablets',      slug: 'tablets',      icon: 'ri-tablet-line',        bg: 'from-indigo-800 to-indigo-950' },
  { id: 'c', name: 'Cameras',      slug: 'cameras',      icon: 'ri-camera-line',        bg: 'from-stone-700 to-stone-900' },
  { id: 'g', name: 'Gaming',       slug: 'gaming',       icon: 'ri-gamepad-line',       bg: 'from-purple-900 to-purple-950' },
  { id: 'a', name: 'Audio',        slug: 'audio',        icon: 'ri-headphone-line',     bg: 'from-gray-800 to-gray-950' },
];

const WHY_FEATURES = [
  { icon: 'ri-shield-check-line',      title: 'Guaranteed Genuine',   body: 'Every product sourced directly from verified manufacturers. Zero counterfeits — your trust is our reputation.' },
  { icon: 'ri-plane-line',             title: 'Direct from China',    body: 'We cut out the middlemen, importing straight from the source so you get fair prices on real tech.' },
  { icon: 'ri-truck-line',             title: 'Delivered in Ghana',   body: 'Accra, Kumasi, Tema and beyond — we handle customs, shipping, and last-mile delivery end to end.' },
  { icon: 'ri-customer-service-line',  title: 'Personal Support',     body: 'Chat directly on WhatsApp. Real people, fast replies, and honest advice — not a bot.' },
];

const PROCESS_STEPS = [
  { n: '01', icon: 'ri-store-2-line',  title: 'Browse & Order',        body: 'Shop online or message us on WhatsApp. Tell us the model, spec, and colour you want.' },
  { n: '02', icon: 'ri-plane-line',    title: 'We Source & Import',    body: 'We procure from verified suppliers in China, manage shipping, and handle customs clearance.' },
  { n: '03', icon: 'ri-gift-line',     title: 'You Receive in Ghana',  body: 'Your genuine product is delivered safely. We keep you updated at every step of the way.' },
];

const TESTIMONIALS = [
  { name: 'Kwame A.',  role: 'Small Business Owner', text: 'Got a MacBook Pro through RNH Imports — 100% genuine, sealed box. The price was better than every local shop I checked. Already placing a second order.' },
  { name: 'Abena M.',  role: 'Student, Legon',        text: 'Ordered an iPad for school and it arrived in perfect condition. They kept me updated the whole time. Incredibly professional service.' },
  { name: 'Kofi B.',   role: 'Photographer',          text: 'My Sony Alpha came directly from them — no issues whatsoever. Their WhatsApp support is fast and the advice is genuine.' },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function Home() {
  usePageTitle('');
  const { getSetting, getActiveBanners } = useCMS();

  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);

  // ── Fetch data ─────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          supabase.from('products')
            .select('*, product_variants(*), product_images(*)')
            .eq('status', 'active').eq('featured', true)
            .order('created_at', { ascending: false }).limit(100),
          supabase.from('categories')
            .select('id, name, slug, image_url, metadata')
            .eq('status', 'active').order('name'),
        ]);
        setFeaturedProducts(productsRes.data || []);
        const all = categoriesRes.data || [];
        const featured = all.filter((c: any) => c.metadata?.featured === true);
        setCategories((featured.length ? featured : all).slice(0, 6));
      } catch (err) {
        console.error('Homepage fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // ── Hero slideshow ─────────────────────────────────────────────────
  const HERO_SLIDES = HERO_SLIDES_HOME;
  useEffect(() => {
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % HERO_SLIDES.length), 3000);
    return () => clearInterval(t);
  }, [HERO_SLIDES.length]);

  // ── CMS values ────────────────────────────────────────────────────
  const heroHeadline     = getSetting('hero_headline').trim() || 'Quality yet Affordable';
  const heroSubheadline  = 'The latest laptops, cameras, and gadgets — sourced globally and delivered straight to you in Ghana.';
  const heroPrimaryText  = 'Shop Now';
  const heroPrimaryLink  = '/shop';
  const heroSecondaryText = 'Browse Products';
  const heroSecondaryLink = '/shop';
  const heroTagText      = getSetting('hero_tag_text')          || 'RNH Imports — Bridging Ghana to the World';
  const stat1Title       = 'Direct Import';
  const stat2Title       = 'Verified Quality';
  const stat3Title       = 'Best Prices';

  const contactPhone = getSetting('contact_phone') || DEFAULT_CONTACT_PHONE;
  const contactEmail = getSetting('contact_email') || 'info@rnhimports.com';
  const waHref = `https://wa.me/233${contactPhone.replace(/\s/g, '').replace(/^0/, '')}`;

  // ── Banners ────────────────────────────────────────────────────────
  const activeBanners = getActiveBanners('top');

  // ── Product card builder ───────────────────────────────────────────
  const buildCard = (product: any) => {
    const variants = product.product_variants || [];
    const hasVariants = variants.length > 0;
    const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || product.price)) : undefined;
    const totalStock = hasVariants ? variants.reduce((s: number, v: any) => s + (v.quantity || 0), 0) : 0;
    const effectiveStock = hasVariants ? totalStock : product.quantity;
    const colorVariants: ColorVariant[] = [];
    const seenColors = new Set<string>();
    for (const c of (product.metadata?.product_options?.color?.values || []) as string[]) {
      const [n, h] = c.split('|');
      if (n && h && !seenColors.has(n.toLowerCase().trim())) {
        seenColors.add(n.toLowerCase().trim());
        colorVariants.push({ name: n.trim(), hex: h });
      }
    }
    for (const v of variants) {
      const cn = (v as any).option2;
      if (cn && !seenColors.has(cn.toLowerCase().trim())) {
        const hex = getColorHex(cn);
        if (hex) { seenColors.add(cn.toLowerCase().trim()); colorVariants.push({ name: cn.trim(), hex }); }
      }
    }
    return (
      <ProductCard
        key={product.id}
        id={product.id}
        slug={product.slug}
        name={product.name}
        price={product.price}
        originalPrice={product.compare_at_price}
        image={product.product_images?.[0]?.url || 'https://via.placeholder.com/400x500'}
        rating={product.rating_avg || 5}
        reviewCount={product.review_count || 0}
        badge={product.featured ? 'Featured' : undefined}
        inStock={effectiveStock > 0}
        isPreorder={product.metadata?.is_preorder ?? !!product.metadata?.preorder_shipping}
        maxStock={effectiveStock || 50}
        moq={product.moq || 1}
        hasVariants={hasVariants}
        minVariantPrice={minVariantPrice}
        colorVariants={colorVariants}
        brand={product.brand || product.vendor}
      />
    );
  };

  return (
    <main className="min-h-screen bg-white">

      {/* ── Announcement banners ────────────────────────────────── */}
      {activeBanners.length > 0 && (
        <div className="bg-primary text-white py-2 overflow-hidden relative z-50">
          <div className="flex animate-marquee whitespace-nowrap">
            {activeBanners.concat(activeBanners).map((b, i) => (
              <span key={i} className="mx-8 text-sm font-medium tracking-wide">{b.title}</span>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          1 · HERO
      ══════════════════════════════════════════════════════════ */}
      <section className="relative w-full min-h-[72vh] sm:min-h-[82vh] lg:min-h-screen flex flex-col justify-end overflow-hidden bg-black">
        {/* Slideshow */}
        <div className="absolute inset-0 z-0">
          <div className="sr-only" aria-hidden>
            {HERO_SLIDES.map((src) => <img key={src} src={src} alt="" />)}
          </div>
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={heroIndex}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.03 }}
              transition={{ scale: { type: 'spring', stiffness: 220, damping: 28 }, opacity: { duration: 0.55 } }}
              className="absolute inset-0"
            >
              <img src={HERO_SLIDES[heroIndex]} className="w-full h-full object-cover object-center" alt="" />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15 pointer-events-none" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 pb-14 sm:pb-18 lg:pb-36 pt-24 sm:pt-28 lg:pt-32 flex flex-col items-center text-center">
          <div className="max-w-3xl mx-auto">
            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="hidden md:inline-flex text-white/70 text-[10px] font-bold tracking-[0.3em] uppercase mb-6 items-center gap-2 px-4 py-1.5 border border-white/20 rounded-full"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {heroTagText}
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.8 }}
              className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white leading-tight mb-5 drop-shadow-xl whitespace-pre-line"
            >
              {heroHeadline}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.7 }}
              className="text-base sm:text-lg text-white/70 mb-8 font-light leading-relaxed max-w-lg mx-auto"
            >
              {heroSubheadline}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.7 }}
              className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap"
            >
              <Link href={heroPrimaryLink} className="inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-full font-bold text-base hover:bg-[#0F1A47] transition-all hover:scale-105 shadow-xl">
                {heroPrimaryText} <i className="ri-arrow-right-line text-lg" />
              </Link>
              <Link href={heroSecondaryLink} className="inline-flex items-center justify-center gap-2 border border-white/30 bg-white/10 text-white hover:bg-white/20 px-8 py-4 rounded-full font-semibold text-base transition-all">
                {heroSecondaryText}
              </Link>

            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85, duration: 1 }}
              className="hidden md:flex flex-wrap items-center justify-center gap-5 mt-10"
            >
              {[
                { icon: 'ri-global-line',       text: stat1Title },
                { icon: 'ri-shield-check-line', text: stat2Title },
                { icon: 'ri-price-tag-3-line',  text: stat3Title },
              ].map((b) => (
                <span key={b.text} className="flex items-center gap-2 text-white/55 text-xs font-medium">
                  <i className={`${b.icon} text-[#8B93C4] text-base`} />{b.text}
                </span>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Slide dots */}
        <div className="hidden md:flex absolute bottom-8 right-8 z-10 gap-2">
          {HERO_SLIDES.map((_, i) => (
            <button key={i} onClick={() => setHeroIndex(i)} className={`transition-all rounded-full ${i === heroIndex ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/35 hover:bg-white/65'}`} aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          2 · BRAND TICKER
      ══════════════════════════════════════════════════════════ */}
      <div className="bg-[#0F1A47] py-3.5 overflow-hidden border-b border-white/5 select-none">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...BRANDS, ...BRANDS].map((brand, i) => (
            <span key={i} className="inline-flex items-center gap-4 mx-5 text-white/35 text-[10px] font-bold tracking-[0.22em] uppercase">
              {brand}
              <span className="w-1 h-1 rounded-full bg-white/15 inline-block" />
            </span>
          ))}
        </div>
      </div>


      {/* ══════════════════════════════════════════════════════════
          4 · FEATURED PRODUCTS
      ══════════════════════════════════════════════════════════ */}
      <section className="pt-24 pb-14 lg:pb-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-14">
            <span className="text-gray-400 font-bold tracking-widest uppercase text-[10px] mb-3 block">Fresh in</span>
            <h2 className="font-serif text-4xl md:text-5xl text-gray-900 mb-4">Featured Products</h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto font-light">
              From iPads and Sony cameras to Beats headphones and Xbox consoles — fresh imports, best sellers.
            </p>
          </AnimatedSection>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-100 aspect-[3/4] rounded-2xl mb-4" />
                  <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <AnimatedGrid className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
              {[...featuredProducts].reverse().map(buildCard)}
            </AnimatedGrid>
          ) : (
            <div className="text-center py-20 border-2 border-dashed border-gray-100 rounded-3xl">
              <i className="ri-store-2-line text-5xl text-gray-200 block mb-4" />
              <p className="text-gray-400 font-semibold mb-2">Products coming soon</p>
              <p className="text-gray-300 text-sm mb-8">Browse our catalogue or ask us directly on WhatsApp</p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link href="/shop" className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#0F1A47] transition-all">
                  Browse Shop <i className="ri-arrow-right-line" />
                </Link>
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#1ebe5d] transition-all">
                  <i className="ri-whatsapp-line" /> Ask on WhatsApp
                </a>
              </div>
            </div>
          )}

          {featuredProducts.length > 0 && (
            <div className="text-center mt-10 lg:mt-12">
              <Link href="/shop" className="inline-flex items-center justify-center gap-2 bg-primary text-white px-10 py-4 rounded-full font-bold text-base hover:bg-[#0F1A47] transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                Shop All Products <i className="ri-arrow-right-line" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          5 · CATEGORIES
      ══════════════════════════════════════════════════════════ */}
      <section className="pt-12 pb-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimatedSection className="flex items-end justify-between mb-14">
            <div>
              <span className="text-gray-400 font-bold tracking-widest uppercase text-[10px] mb-3 block">Collections</span>
              <h2 className="font-serif text-4xl md:text-5xl text-gray-900 leading-tight">Shop by Category</h2>
              <p className="text-gray-400 text-lg mt-3 max-w-md font-light">Genuine electronics, gadgets, and tech — sourced directly and priced honestly.</p>
            </div>
            <Link href="/categories" className="hidden md:flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-primary hover:gap-3 transition-all">
              View All <i className="ri-arrow-right-line" />
            </Link>
          </AnimatedSection>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array(6).fill(0).map((_, i) => <div key={i} className="aspect-square rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : categories.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[...categories].reverse().map((cat) => (
                <Link href={`/shop?category=${cat.slug}`} key={cat.id} className="group block">
                  <div className="aspect-square rounded-2xl overflow-hidden relative shadow-sm hover:shadow-xl transition-all duration-500 bg-gray-100">
                    <Image
                      src={cat.image || cat.image_url || `https://via.placeholder.com/600x800?text=${encodeURIComponent(cat.name)}`}
                      alt={cat.name}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 1024px) 33vw, 16vw"
                      quality={85}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute bottom-4 inset-x-0 px-3 text-center">
                      <h3 className="font-medium text-sm text-white drop-shadow-md">{cat.name}</h3>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            /* Fallback icon grid when DB has no categories */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[...FALLBACK_CATEGORIES].reverse().map((cat) => (
                <Link href={`/shop?category=${cat.slug}`} key={cat.id} className="group block">
                  <div className={`aspect-square rounded-2xl overflow-hidden bg-gradient-to-br ${cat.bg} shadow-sm hover:shadow-xl transition-all duration-500`}>
                    <div className="h-full flex flex-col items-center justify-center text-white p-4 gap-3">
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center group-hover:bg-white/20 transition-colors">
                        <i className={`${cat.icon} text-2xl text-white`} />
                      </div>
                      <div className="text-center">
                        <h3 className="font-semibold text-base text-white">{cat.name}</h3>
                        <p className="text-white/40 text-[9px] mt-0.5 font-medium tracking-widest uppercase">Explore</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-10 text-center md:hidden">
            <Link href="/categories" className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
              View All Categories <i className="ri-arrow-right-line" />
            </Link>
          </div>
        </div>
      </section>





      {/* ══════════════════════════════════════════════════════════
          8.5 · CUSTOMER REVIEWS — single proof strip
      ══════════════════════════════════════════════════════════ */}
      <section className="pt-8 lg:pt-10 pb-16 lg:pb-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <AnimatedSection>
              <span className="inline-block py-1 px-3 rounded-full bg-stone-100 text-gray-900 text-[10px] font-bold tracking-widest uppercase mb-4">
                Top Rated
              </span>
              <h2 className="font-serif text-3xl md:text-4xl text-gray-900 mb-4 leading-tight">
                Loved by buyers across Ghana.
              </h2>
              <p className="text-gray-500 text-sm md:text-base font-light leading-relaxed mb-6 max-w-md">
                Hundreds of customers trust RNH Imports for genuine products, transparent pricing, and direct support — and they say so themselves.
              </p>
              <div className="flex items-center gap-6 mb-6">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    {[...Array(5)].map((_, i) => (
                      <i key={i} className="ri-star-fill text-amber-400 text-base" />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 tracking-wide">5.0 average rating</p>
                </div>
                <div className="h-10 w-px bg-gray-200" />
                <div>
                  <p className="text-2xl font-bold text-gray-900 leading-none">100%</p>
                  <p className="text-xs text-gray-400 tracking-wide mt-1">Verified buyers</p>
                </div>
              </div>
              <Link
                href="/shop"
                className="group inline-flex items-center gap-3 rounded-full bg-[#0F1A47] text-white px-5 py-3 text-sm font-bold shadow-lg shadow-[#0F1A47]/20 hover:bg-primary hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
              >
                <span>Start your order</span>
                <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-0.5">
                  <i className="ri-arrow-right-line text-base" />
                </span>
              </Link>
            </AnimatedSection>

            <AnimatedSection delay={0.1} className="relative">
              <div className="relative aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5] max-w-md mx-auto rounded-3xl overflow-hidden bg-stone-100 shadow-xl shadow-gray-200/60">
                <img
                  src="/images/reviews/phone-mockup-jersey.png"
                  alt="Top rated reviews from RNH Imports customers"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          9 · TRUST FEATURES  (hardcoded — always correct)
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 bg-stone-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-12">
            {[
              { icon: 'ri-shield-check-line',      title: 'Genuine Products',     desc: 'Every item verified genuine — zero counterfeits, guaranteed every order.' },
              { icon: 'ri-plane-line',              title: 'Direct from China',    desc: 'Sourced straight from manufacturers. No unnecessary middlemen.' },
              { icon: 'ri-truck-line',              title: 'Ghana-wide Delivery',  desc: 'We handle shipping, customs, and last-mile delivery across Ghana.' },
              { icon: 'ri-whatsapp-line',           title: 'WhatsApp Support',     desc: 'Real people. Fast answers. Available Monday–Saturday.' },
            ].map((f, i) => (
              <AnimatedSection key={f.title} delay={i * 0.1} className="flex flex-col items-start group">
                <div className="mb-5 w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-all duration-300">
                  <i className={`${f.icon} text-xl text-primary group-hover:text-white transition-colors`} />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-sm tracking-wide">{f.title}</h3>
                <div className="h-0.5 w-8 bg-gray-200 mb-3 group-hover:w-12 group-hover:bg-primary transition-all duration-500" />
                <p className="text-gray-400 text-sm leading-relaxed font-light">{f.desc}</p>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          10 · WHATSAPP CTA
      ══════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 sm:px-6 bg-white relative">
        <AnimatedSection className="max-w-4xl mx-auto">
          <div className="relative rounded-3xl bg-gradient-to-br from-[#1B2A6B] via-[#0F1A47] to-black overflow-hidden shadow-2xl shadow-[#1B2A6B]/20 p-8 sm:p-10 lg:p-12 flex flex-col md:flex-row items-center justify-between gap-10 border border-gray-100/10">
            {/* Abstract Background Elements */}
            <div className="absolute top-0 right-0 w-[30rem] h-[30rem] -translate-y-1/2 translate-x-1/3 rounded-full bg-primary/20 blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[20rem] h-[20rem] translate-y-1/3 -translate-x-1/4 rounded-full bg-[#25D366]/10 blur-[60px] pointer-events-none" />

            <div className="relative z-10 text-left md:max-w-md">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                <span className="text-white/80 text-[10px] font-bold tracking-widest uppercase">We're Online</span>
              </div>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-white mb-4 leading-tight">
                Still have <span className="italic text-white/70">questions?</span>
              </h2>
              <p className="text-white/60 text-sm font-light leading-relaxed mb-8">
                Not sure what model to get? Need a specific spec? Chat with our team directly. Real people, honest advice, and fast replies.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-105 shadow-xl shadow-[#25D366]/20 group">
                  <i className="ri-whatsapp-line text-xl group-hover:rotate-12 transition-transform" />
                  Chat on WhatsApp
                </a>
                <a href={`mailto:${contactEmail}`} className="inline-flex items-center justify-center gap-2 border border-white/20 bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-full font-semibold text-sm transition-all backdrop-blur-sm">
                  <i className="ri-mail-line text-lg" />
                  Email Us
                </a>
              </div>
              <p className="text-white/30 text-[9px] mt-6 tracking-wider uppercase font-medium">
                Mon–Fri 9am–6pm · Sat 10am–4pm
              </p>
            </div>


          </div>
        </AnimatedSection>
      </section>

    </main>
  );
}

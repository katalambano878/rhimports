'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MiniCart from './MiniCart';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import { DEFAULT_CONTACT_PHONE } from '@/lib/contact';

interface SearchResult {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
  category: string;
}

const SHOP_CATEGORIES = [
  { icon: 'ri-computer-line',     label: 'Laptops',      href: '/shop?category=laptops',      desc: 'MacBooks, Dell, HP & more' },
  { icon: 'ri-smartphone-line',   label: 'Phones',       href: '/shop?category=smartphones',   desc: 'iPhones, Samsung, Pixel' },
  { icon: 'ri-tablet-line',       label: 'Tablets',      href: '/shop?category=tablets',       desc: 'iPads, Galaxy Tab & more' },
  { icon: 'ri-camera-line',       label: 'Cameras',      href: '/shop?category=cameras',       desc: 'Sony, Canon, Fujifilm' },
  { icon: 'ri-gamepad-line',      label: 'Gaming',       href: '/shop?category=gaming',        desc: 'Xbox, PlayStation, Nintendo' },
  { icon: 'ri-headphone-line',    label: 'Audio',        href: '/shop?category=audio',         desc: 'Beats, Bose, Sony' },
  { icon: 'ri-heart-pulse-line',  label: 'Wearables',    href: '/shop?category=wearables',     desc: 'Apple Watch, Galaxy Watch' },
  { icon: 'ri-tv-2-line',         label: 'TVs & Displays', href: '/shop?category=tv-displays', desc: 'Smart TVs, Monitors' },
];

const QUICK_SEARCH_TERMS = ['Laptops', 'iPhones', 'iPads', 'Sony Cameras', 'Beats Headphones', 'Xbox', 'Smart Watches'];

export default function Header() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen]   = useState(false);
  const [isSearchOpen, setIsSearchOpen]           = useState(false);
  const [searchQuery, setSearchQuery]             = useState('');
  const [searchResults, setSearchResults]         = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading]         = useState(false);
  const [wishlistCount, setWishlistCount]         = useState(0);
  const [user, setUser]                           = useState<any>(null);
  const [isScrolled, setIsScrolled]               = useState(false);
  const [activeMegaMenu, setActiveMegaMenu]       = useState<string | null>(null);
  const [logoError, setLogoError]                 = useState(false);

  const searchInputRef   = useRef<HTMLInputElement>(null);
  const searchTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const megaTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { getSetting, getSettingJSON }           = useCMS();

  const siteName     = getSetting('site_name') || 'RNH Imports';
  const siteLogo     = '/logo.png';
  const rawLogoH = Number.parseInt(getSetting('header_logo_height') || '52', 10);
  /** px — larger default on desktop & mobile */
  const logoHeight = Number.isFinite(rawLogoH) ? Math.min(72, Math.max(26, rawLogoH)) : 52;
  const scrolledLogoH = isScrolled ? Math.max(logoHeight - 8, 28) : logoHeight;
  const showSearch   = getSetting('header_show_search')   !== 'false';
  const showWishlist = getSetting('header_show_wishlist') !== 'false';
  const showCart     = getSetting('header_show_cart')     !== 'false';
  const showAccount  = getSetting('header_show_account')  !== 'false';
  const contactPhone = getSetting('contact_phone') || DEFAULT_CONTACT_PHONE;
  const contactEmail = getSetting('contact_email') || 'info@rnhimports.com';
  const waHref       = `https://wa.me/233${contactPhone.replace(/\s/g, '').replace(/^0/, '')}`;

  const navLinks = getSettingJSON<{ label: string; href: string }[]>('header_nav_links_json', [
    { label: 'Shop',       href: '/shop' },
    { label: 'Categories', href: '/categories' },
    { label: 'Services',   href: '/service' },
    { label: 'About',      href: '/about' },
    { label: 'Contact',    href: '/contact' },
  ]);

  // ── scroll detection ───────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 72);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── wishlist + auth ────────────────────────────────────────────────
  useEffect(() => {
    const syncWishlist = () => setWishlistCount(JSON.parse(localStorage.getItem('wishlist') || '[]').length);
    syncWishlist();
    window.addEventListener('wishlistUpdated', syncWishlist);
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => { window.removeEventListener('wishlistUpdated', syncWishlist); subscription.unsubscribe(); };
  }, []);

  // ── search ────────────────────────────────────────────────────────
  const fetchSearchResults = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('id, slug, name, price, categories!inner(name), product_images!product_id(url, position)')
        .ilike('name', `%${trimmed}%`)
        .order('position', { foreignTable: 'product_images', ascending: true })
        .limit(8);
      setSearchResults((data || []).map((p: any) => ({
        id: p.id, slug: p.slug, name: p.name, price: p.price,
        image: p.product_images?.[0]?.url || '/placeholder.png',
        category: p.categories?.name || '',
      })));
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, []);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => fetchSearchResults(value), 250);
  }, [fetchSearchResults]);

  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);
  useEffect(() => () => { if (megaTimerRef.current)   clearTimeout(megaTimerRef.current); },   []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
  };

  const closeSearch = () => { setIsSearchOpen(false); setSearchQuery(''); setSearchResults([]); };
  const handleMobileNav = (href: string) => {
    setIsMobileMenuOpen(false);
    router.push(href);
  };

  // ── mega menu ─────────────────────────────────────────────────────
  const MEGA_KEYS = new Set(['Shop', 'Categories']);

  const openMega  = (key: string) => { if (megaTimerRef.current) clearTimeout(megaTimerRef.current); setActiveMegaMenu(key); };
  const closeMega = ()            => { megaTimerRef.current = setTimeout(() => setActiveMegaMenu(null), 120); };
  const keepMega  = ()            => { if (megaTimerRef.current) clearTimeout(megaTimerRef.current); };

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          TOP BAR  (hides on scroll)
      ═══════════════════════════════════════════════════════════ */}
      <div
        className={`bg-[#1B2A6B] text-white text-xs hidden lg:block overflow-hidden transition-all duration-300 ${
          isScrolled ? 'max-h-0 opacity-0' : 'max-h-10 opacity-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-9 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-white/70">
            <span className="flex items-center gap-1.5">
              <i className="ri-map-pin-2-line text-white/50" />
              Amasaman Achiaman, Annosel Junction · Accra
            </span>
            <span className="flex items-center gap-1.5">
              <i className="ri-time-line text-white/50" />
              Mon–Fri 9am–6pm · Sat 10am–4pm
            </span>
          </div>
          <div className="flex items-center gap-4 text-white/70">
            <a href={`tel:${contactPhone}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
              <i className="ri-phone-line" />{contactPhone}
            </a>
            <a href={`mailto:${contactEmail}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
              <i className="ri-mail-line" />{contactEmail}
            </a>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] px-3 py-0.5 rounded-full transition-colors text-white font-semibold"
            >
              <i className="ri-whatsapp-line" />
              New: {contactPhone}
            </a>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          MAIN HEADER
      ═══════════════════════════════════════════════════════════ */}
      <header
        className={`bg-white sticky top-0 z-50 transition-all duration-300 ${
          isScrolled ? 'shadow-lg border-b border-gray-100' : 'border-b border-gray-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className={`flex items-center justify-between transition-all duration-300 ${isScrolled ? 'min-h-[3.25rem] sm:min-h-14 py-2' : 'min-h-[3.85rem] sm:min-h-[4.85rem] py-2 sm:py-2.5'}`}>

            {/* ── Left: hamburger + logo ── */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-primary rounded-lg hover:bg-gray-50 transition-all"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open menu"
              >
                <i className="ri-menu-3-line text-xl" />
              </button>
              <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label={siteName + ' home'}>
                {!logoError ? (
                  <img
                    src={siteLogo}
                    alt={siteName}
                    className="w-auto object-contain transition-all duration-300"
                    style={{ height: `${scrolledLogoH}px` }}
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span className="text-lg font-bold text-primary tracking-tight">{siteName}</span>
                )}
              </Link>
            </div>

            {/* ── Center: desktop nav ── */}
            <nav className="hidden lg:flex items-center gap-0.5" aria-label="Main navigation">
              {navLinks.map((link) => {
                const hasMega = MEGA_KEYS.has(link.label);
                const isActive = activeMegaMenu === link.label;
                return (
                  <div
                    key={link.href}
                    className="relative"
                    onMouseEnter={() => hasMega ? openMega(link.label) : setActiveMegaMenu(null)}
                    onMouseLeave={() => hasMega ? closeMega() : undefined}
                  >
                    <Link
                      href={link.href}
                      className={`flex items-center gap-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'text-primary bg-primary/5'
                          : 'text-gray-700 hover:text-primary hover:bg-gray-50'
                      }`}
                    >
                      {link.label}
                      {hasMega && (
                        <i className={`ri-arrow-down-s-line text-base transition-transform duration-200 ${isActive ? 'rotate-180 text-primary' : 'text-gray-400'}`} />
                      )}
                    </Link>

                    {/* subtle active underline */}
                    {isActive && <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />}
                  </div>
                );
              })}
            </nav>

            {/* ── Right: action icons ── */}
            <div className="flex items-center gap-0.5 sm:gap-1">
              {showSearch && (
                <button
                  type="button"
                  className="p-2.5 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-xl transition-all"
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Search"
                >
                  <i className="ri-search-line text-[1.15rem]" />
                </button>
              )}
              {showWishlist && (
                <Link
                  href="/wishlist"
                  className="p-2.5 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-xl transition-all relative"
                  aria-label={wishlistCount > 0 ? `Wishlist, ${wishlistCount} items` : 'Wishlist'}
                >
                  <i className="ri-heart-line text-[1.15rem]" />
                  {wishlistCount > 0 && (
                    <span className="absolute top-1.5 right-1 min-w-[16px] h-[16px] px-0.5 bg-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {wishlistCount}
                    </span>
                  )}
                </Link>
              )}
              {showAccount && (
                <Link
                  href={user ? '/account' : '/auth/login'}
                  className="p-2.5 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-xl transition-all hidden sm:block"
                  aria-label={user ? 'Account' : 'Log in'}
                >
                  {user
                    ? <i className="ri-user-3-line text-[1.15rem]" />
                    : <i className="ri-user-line text-[1.15rem]" />
                  }
                </Link>
              )}
              {showCart && (
                <div className="relative ml-1">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-[#0F1A47] transition-all duration-200 font-semibold text-sm shadow-sm hover:shadow-md hover:-translate-y-px"
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : 'Cart'}
                    aria-expanded={isCartOpen}
                    aria-controls="mini-cart"
                  >
                    <i className="ri-shopping-bag-line text-base" />
                    <span className="hidden sm:inline">Cart</span>
                    {cartCount > 0 && (
                      <span className="min-w-[18px] h-[18px] bg-white text-primary text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 -mr-1">
                        {cartCount}
                      </span>
                    )}
                  </button>
                  <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            MEGA MENU DROPDOWN
        ═══════════════════════════════════════════════════════════ */}
        {activeMegaMenu && (
          <div
            className="absolute left-0 right-0 top-full bg-white border-t border-gray-100 shadow-2xl"
            onMouseEnter={keepMega}
            onMouseLeave={closeMega}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
              <div className="grid grid-cols-[1fr_264px] gap-10">

                {/* Category grid */}
                <div>
                  <p className="text-[10px] font-bold tracking-[0.22em] text-gray-400 uppercase mb-5">
                    Shop by Category
                  </p>
                  <div className="grid grid-cols-4 gap-2.5">
                    {SHOP_CATEGORIES.map((cat) => (
                      <Link
                        key={cat.href}
                        href={cat.href}
                        onClick={() => setActiveMegaMenu(null)}
                        className="flex items-start gap-3 p-3.5 rounded-2xl hover:bg-primary/5 border border-transparent hover:border-primary/10 transition-all group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:shadow-md transition-all duration-200">
                          <i className={`${cat.icon} text-primary group-hover:text-white text-lg transition-colors`} />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors leading-tight">{cat.label}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{cat.desc}</p>
                        </div>
                      </Link>
                    ))}
                  </div>

                  <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1.5"><i className="ri-shield-check-line text-primary/60" />100% Genuine</span>
                      <span className="flex items-center gap-1.5"><i className="ri-plane-line text-primary/60" />Direct Import</span>
                      <span className="flex items-center gap-1.5"><i className="ri-truck-line text-primary/60" />Ghana Delivery</span>
                    </div>
                    <Link
                      href="/shop"
                      onClick={() => setActiveMegaMenu(null)}
                      className="flex items-center gap-1.5 text-sm font-bold text-primary hover:gap-3 transition-all duration-200"
                    >
                      View all products <i className="ri-arrow-right-line" />
                    </Link>
                  </div>
                </div>

                {/* Promo panel */}
                <div className="bg-gradient-to-br from-[#1B2A6B] to-[#0F1A47] rounded-2xl p-6 text-white flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `radial-gradient(circle at 80% 20%, #4A6CF7 0%, transparent 60%)` }} />
                  <div className="relative">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase bg-white/10 text-white/80 px-2.5 py-1 rounded-full mb-4">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      New Arrivals
                    </span>
                    <h3 className="font-serif text-xl leading-snug mb-2">Fresh imports, just landed</h3>
                    <p className="text-white/55 text-sm leading-relaxed">
                      Laptops, cameras, phones and more — direct from verified suppliers in China.
                    </p>
                  </div>
                  <div className="relative mt-6 space-y-2">
                    <Link
                      href="/shop?sort=newest"
                      onClick={() => setActiveMegaMenu(null)}
                      className="flex items-center justify-center gap-2 w-full bg-white text-[#1B2A6B] px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-white/90 transition-colors"
                    >
                      Shop new arrivals <i className="ri-arrow-right-line" />
                    </Link>
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                      <i className="ri-whatsapp-line text-[#25D366]" />
                      Ask via WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ═══════════════════════════════════════════════════════════
          SEARCH OVERLAY
      ═══════════════════════════════════════════════════════════ */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeSearch(); }}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div className="bg-white w-full shadow-2xl border-b border-gray-100">
            <div className="max-w-3xl mx-auto px-4 py-4">
              <form onSubmit={handleSearch} className="flex items-center gap-3">
                <i className="ri-search-line text-xl text-gray-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="Search laptops, phones, cameras..."
                  className="flex-1 py-2 text-lg focus:outline-none placeholder:text-gray-300 bg-transparent"
                  autoFocus
                  autoComplete="off"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { handleSearchInput(''); searchInputRef.current?.focus(); }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label="Clear"
                  >
                    <i className="ri-close-circle-fill text-lg" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeSearch}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
                  aria-label="Close search"
                >
                  <i className="ri-close-line text-xl" />
                </button>
              </form>

              <div className="mt-3 pb-4 max-h-[62vh] overflow-y-auto">
                {searchLoading && searchQuery.trim() && (
                  <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
                    <i className="ri-loader-4-line animate-spin text-xl" />
                    <span className="text-sm">Searching...</span>
                  </div>
                )}

                {!searchLoading && searchResults.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {searchResults.map((product) => (
                        <Link
                          key={product.id}
                          href={`/product/${product.slug}`}
                          className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100"
                          onClick={closeSearch}
                        >
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                            <img src={product.image} alt={product.name} className="w-full h-full object-cover object-top" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{product.name}</p>
                            {product.category && <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>}
                            <p className="text-sm font-bold text-primary mt-1">GH₵{product.price.toLocaleString()}</p>
                          </div>
                          <i className="ri-arrow-right-line text-gray-300 shrink-0" />
                        </Link>
                      ))}
                    </div>
                    <Link
                      href={`/shop?search=${encodeURIComponent(searchQuery)}`}
                      className="flex items-center justify-center gap-2 w-full mt-4 py-3 text-sm font-semibold text-primary border border-primary/20 rounded-2xl hover:bg-primary hover:text-white transition-all"
                      onClick={closeSearch}
                    >
                      View all results for &ldquo;{searchQuery}&rdquo;
                      <i className="ri-arrow-right-line" />
                    </Link>
                  </>
                )}

                {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                  <div className="py-10 text-center">
                    <i className="ri-search-line text-5xl text-gray-100 block mb-3" />
                    <p className="text-gray-500 font-semibold">No results for &ldquo;{searchQuery}&rdquo;</p>
                    <p className="text-sm text-gray-400 mt-1">Try a different keyword or browse all products</p>
                    <Link
                      href="/shop"
                      onClick={closeSearch}
                      className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-primary hover:underline"
                    >
                      Browse all products <i className="ri-arrow-right-line" />
                    </Link>
                  </div>
                )}

                {!searchQuery.trim() && (
                  <div className="py-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Browse</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_SEARCH_TERMS.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => handleSearchInput(term)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm text-gray-600 bg-gray-50 hover:bg-primary/8 hover:text-primary rounded-full border border-gray-200 hover:border-primary/20 transition-all"
                        >
                          <i className="ri-search-line text-xs opacity-50" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MOBILE MENU DRAWER
      ═══════════════════════════════════════════════════════════ */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="absolute top-0 left-0 bottom-0 w-full max-w-[340px] bg-white shadow-2xl flex flex-col">

            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2">
                {!logoError ? (
                  <img
                    src={siteLogo}
                    alt={siteName}
                    className="w-auto max-w-[200px] object-contain"
                    style={{ height: `${logoHeight}px` }}
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span className="font-bold text-primary text-lg">{siteName}</span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-gray-500 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-colors"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-3 px-3" aria-label="Mobile navigation">
              {[
                { href: '/',           icon: 'ri-home-line',              label: 'Home' },
                { href: '/shop',       icon: 'ri-store-line',             label: 'Shop' },
                { href: '/categories', icon: 'ri-grid-line',              label: 'All Categories' },
                { href: '/service',    icon: 'ri-tools-line',             label: 'Services' },
                { href: '/about',      icon: 'ri-information-line',       label: 'About Us' },
                { href: '/contact',    icon: 'ri-customer-service-line',  label: 'Contact' },
              ].map(({ href, icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={(e) => { e.preventDefault(); handleMobileNav(href); }}
                  className="flex items-center gap-3.5 px-4 py-3 text-sm font-medium text-gray-700 rounded-2xl hover:bg-gray-50 hover:text-primary transition-all group"
                >
                  <i className={`${icon} text-base text-gray-400 group-hover:text-primary transition-colors`} />
                  {label}
                  <i className="ri-arrow-right-s-line ml-auto text-gray-300 group-hover:text-primary/50 transition-colors" />
                </Link>
              ))}
            </nav>

            {/* Drawer footer CTAs */}
            <div className="border-t border-gray-100 p-4 space-y-2.5 bg-gray-50/60">
              <Link
                href={user ? '/account' : '/auth/login'}
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-primary border-2 border-primary/20 bg-white rounded-2xl hover:bg-primary/5 transition-colors"
              >
                <i className="ri-user-line" />
                {user ? 'My Account' : 'Sign In'}
              </Link>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-white bg-[#25D366] rounded-2xl hover:bg-[#1ebe5d] transition-colors shadow-sm"
              >
                <i className="ri-whatsapp-line text-base" />
                Chat on WhatsApp · {contactPhone}
              </a>
              <p className="text-[10px] text-gray-400 text-center pt-1">
                {contactPhone} · {contactEmail}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

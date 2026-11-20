'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type BellCounts = {
  newOrders: number;
  unpaidToday: number;
  lowStock: number;
  newMessages: number;
  openTickets: number;
  pendingReturns: number;
  pendingReviews: number;
};

const BELL_SEEN_KEY = 'rnh_admin_bell_seen_at';

function readBellSeen(): string | null {
  try {
    return localStorage.getItem(BELL_SEEN_KEY);
  } catch {
    return null;
  }
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Module Filtering State
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [storeName, setStoreName] = useState('RNH Imports');
  const [storeLogo, setStoreLogo] = useState<string | null>(null);

  // Header bell: real counts of things waiting for staff.
  const [showBell, setShowBell] = useState(false);
  const [bell, setBell] = useState<BellCounts | null>(null);
  const [bellSeenAt, setBellSeenAt] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();

      if (pathname === '/admin/login') {
        setIsLoading(false);
        return;
      }

      if (!session) {
        setIsLoading(false);
        // Come back to this page after signing in.
        const back = pathname && pathname !== '/admin' ? `?redirect=${encodeURIComponent(pathname)}` : '';
        router.push(`/admin/login${back}`);
        return;
      }

      // Check user role from profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) {
        console.error('Failed to fetch user profile', profileError);
        setIsLoading(false);
        router.push('/admin/login?error=no_profile');
        return;
      }

      // Only allow admin and staff roles
      if (profile.role !== 'admin' && profile.role !== 'staff') {
        console.warn('User does not have admin/staff role');
        await supabase.auth.signOut();
        setIsLoading(false);
        router.push('/admin/login?error=unauthorized');
        return;
      }

      setUser(session.user);
      setUserRole(profile.role);
      setIsAuthenticated(true);
      setIsLoading(false);
    }

    checkAuth();
  }, [pathname, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showUserMenu && !target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
      if (showBell && !target.closest('.bell-menu-container')) {
        setShowBell(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBell(false);
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showUserMenu, showBell]);

  // Bell counts: cheap head-count queries, refreshed every 2 minutes.
  useEffect(() => {
    if (!isAuthenticated || !userRole) return;
    let cancelled = false;

    const count = async (q: PromiseLike<{ count: number | null; error: any }>) => {
      const { count: n, error } = await q;
      return error ? 0 : n || 0;
    };

    async function loadBell() {
      const seen = readBellSeen();
      // Ghana is on UTC all year, so "today" starts at 00:00Z.
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const since = seen || today.toISOString();

      const [newOrders, unpaidToday, newMessages, openTickets, pendingReturns, pendingReviews, stockRows] =
        await Promise.all([
          count(supabase.from('orders').select('id', { count: 'exact', head: true })
            .eq('payment_status', 'paid').gt('created_at', since)),
          count(supabase.from('orders').select('id', { count: 'exact', head: true })
            .neq('payment_status', 'paid').not('status', 'in', '(cancelled,refunded)')
            .gte('created_at', today.toISOString())),
          count(supabase.from('contact_submissions').select('id', { count: 'exact', head: true })
            .eq('status', 'new')),
          count(supabase.from('support_tickets').select('id', { count: 'exact', head: true })
            .in('status', ['open', 'in_progress'])),
          count(supabase.from('return_requests').select('id', { count: 'exact', head: true })
            .eq('status', 'pending')),
          count(supabase.from('reviews').select('id', { count: 'exact', head: true })
            .eq('status', 'pending')),
          supabase.from('products').select('quantity, metadata')
            .eq('track_quantity', true).neq('status', 'archived').lte('quantity', 100).limit(1000),
        ]);

      const lowStock = (stockRows.data || []).filter((p: any) => {
        const t = Number(p.metadata?.low_stock_threshold);
        return (p.quantity ?? 0) <= (Number.isFinite(t) && t > 0 ? t : 5);
      }).length;

      if (!cancelled) {
        setBellSeenAt(seen);
        setBell({ newOrders, unpaidToday, lowStock, newMessages, openTickets, pendingReturns, pendingReviews });
      }
    }

    loadBell();
    const timer = setInterval(loadBell, 120000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isAuthenticated, userRole]);

  const markBellSeen = () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(BELL_SEEN_KEY, now);
    } catch {
      /* private mode: the count just won't reset */
    }
    setBellSeenAt(now);
    setBell(prev => (prev ? { ...prev, newOrders: 0 } : prev));
  };

  // Fetch Modules Effect
  useEffect(() => {
    async function fetchModules() {
      try {
        const { data, error } = await supabase.from('store_modules').select('id, enabled');
        if (error) {
          console.warn('Error fetching modules:', error);
          return;
        }
        if (data) {
          setEnabledModules(data.filter((m: any) => m.enabled).map((m: any) => m.id));
        }
      } catch (err) {
        console.warn('Fetch modules failed:', err);
      }
    }
    fetchModules();

    // Fetch store name and logo
    supabase.from('store_settings').select('key, value').in('key', ['site_name', 'site_logo']).then(({ data }) => {
      data?.forEach((row: { key: string; value: unknown }) => {
        const v = row.value != null ? String(row.value) : '';
        if (row.key === 'site_name' && v) setStoreName(v);
        if (row.key === 'site_logo' && v) setStoreLogo(v);
      });
    });
  }, []);

  // Screen size check for initial state
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        // Only set to false if it's currently true? 
        // Actually, let's just default to open on desktop, closed on mobile on mount only
      }
    };

    // Set initial state based on width
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }

    // Optional: Auto-close on resize to mobile? For now, leave as is.
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading Admin...</div>;
  }

  const menuItems = [
    {
      title: 'Dashboard',
      icon: 'ri-dashboard-line',
      path: '/admin',
      exact: true
    },
    {
      title: 'Orders',
      icon: 'ri-shopping-bag-line',
      path: '/admin/orders',
      badge: bell?.unpaidToday ? String(bell.unpaidToday) : ''
    },
    {
      title: 'POS System',
      icon: 'ri-store-3-line',
      path: '/admin/pos'
    },
    {
      title: 'Products',
      icon: 'ri-box-3-line',
      path: '/admin/products'
    },
    {
      title: 'Categories',
      icon: 'ri-folder-line',
      path: '/admin/categories'
    },
    {
      title: 'Customers',
      icon: 'ri-group-line',
      path: '/admin/customers'
    },
    {
      title: 'Reviews',
      icon: 'ri-chat-smile-2-line',
      path: '/admin/reviews',
      badge: bell?.pendingReviews ? String(bell.pendingReviews) : ''
    },
    {
      title: 'Messages',
      icon: 'ri-mail-line',
      path: '/admin/messages',
      badge: bell?.newMessages ? String(bell.newMessages) : ''
    },
    {
      title: 'Support tickets',
      icon: 'ri-customer-service-2-line',
      path: '/admin/support',
      badge: bell?.openTickets ? String(bell.openTickets) : ''
    },
    {
      title: 'Returns',
      icon: 'ri-arrow-go-back-line',
      path: '/admin/returns',
      badge: bell?.pendingReturns ? String(bell.pendingReturns) : ''
    },
    {
      title: 'Inventory',
      icon: 'ri-stack-line',
      path: '/admin/inventory'
    },
    {
      title: 'Analytics',
      icon: 'ri-bar-chart-line',
      path: '/admin/analytics'
    },
    {
      title: 'Coupons',
      icon: 'ri-coupon-2-line',
      path: '/admin/coupons'
    },
    {
      title: 'Customer Insights',
      icon: 'ri-user-search-line',
      path: '/admin/customer-insights',
      moduleId: 'customer-insights'
    },
    {
      title: 'Notifications',
      icon: 'ri-notification-3-line',
      path: '/admin/notifications',
      moduleId: 'notifications'
    },
    {
      title: 'SMS Debugger',
      icon: 'ri-message-2-line',
      path: '/admin/test-sms'
    },

    {
      title: 'Blog',
      icon: 'ri-article-line',
      path: '/admin/blog',
      moduleId: 'blog'
    },
    {
      title: 'Modules',
      icon: 'ri-puzzle-line',
      path: '/admin/modules',
      adminOnly: true
    },
    {
      title: 'Settings',
      icon: 'ri-settings-3-line',
      path: '/admin/settings'
    },
  ];

  const visibleMenuItems = (menuItems as Array<typeof menuItems[number] & { moduleId?: string; adminOnly?: boolean; badge?: string; exact?: boolean }>).filter(item => {
    if (item.adminOnly && userRole !== 'admin') return false;
    if (!item.moduleId) return true;
    return enabledModules.includes(item.moduleId);
  });

  // Special layout for Login Page
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden glass-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Mobile: Transform / Desktop: Width transition */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen bg-white border-r border-gray-200 transition-all duration-300
          w-64
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          ${isSidebarOpen ? 'lg:w-64' : 'lg:w-0 lg:overflow-hidden'}
          lg:translate-x-0
        `}
      >
        <div className="h-full px-4 py-6 overflow-y-auto">
          <Link href="/admin" className="flex items-center gap-3 mb-8 px-2 cursor-pointer">
            {storeLogo ? (
              <img
                src={storeLogo}
                alt={storeName}
                className="h-9 w-auto object-contain max-w-[140px]"
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
              />
            ) : null}
            <span className={`text-xl font-bold text-gray-900 ${storeLogo ? 'hidden' : ''}`}>{storeName}</span>
            <span className="text-sm font-semibold text-gray-500 shrink-0">ADMIN</span>
          </Link>

          <nav className="space-y-1">
            {visibleMenuItems.map((item) => {
              const isActive = item.exact ? pathname === item.path : pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)} // Close on mobile click
                  className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors cursor-pointer ${isActive
                    ? 'bg-gray-50 text-gray-900 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-center space-x-3">
                    <i className={`${item.icon} text-xl w-5 h-5 flex items-center justify-center`}></i>
                    <span>{item.title}</span>
                  </div>
                  {item.badge && (
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <Link
              href="/"
              target="_blank"
              onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)}
              className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
            >
              <i className="ri-external-link-line text-xl w-5 h-5 flex items-center justify-center"></i>
              <span>View Store</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 ml-0 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}`}>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 py-4 lg:px-6 flex items-center justify-between">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <i className={`${isSidebarOpen ? 'ri-menu-fold-line' : 'ri-menu-unfold-line'} text-xl`}></i>
            </button>

            <div className="flex items-center space-x-2 lg:space-x-4">
              {(() => {
                const items = bell ? [
                  { n: bell.newOrders, label: bellSeenAt ? 'new paid orders since you last checked' : 'paid orders today', href: '/admin/orders', icon: 'ri-shopping-bag-line' },
                  { n: bell.unpaidToday, label: 'orders today still awaiting payment', href: '/admin/orders', icon: 'ri-time-line' },
                  { n: bell.pendingReviews, label: 'reviews waiting for approval', href: '/admin/reviews', icon: 'ri-chat-smile-2-line' },
                  { n: bell.newMessages, label: 'new contact messages', href: '/admin/messages', icon: 'ri-mail-line' },
                  { n: bell.openTickets, label: 'open support tickets', href: '/admin/support', icon: 'ri-customer-service-2-line' },
                  { n: bell.pendingReturns, label: 'return requests to review', href: '/admin/returns', icon: 'ri-arrow-go-back-line' },
                  { n: bell.lowStock, label: 'products low on stock', href: '/admin/inventory', icon: 'ri-stack-line' },
                ].filter(i => i.n > 0) : [];
                // Low stock is listed but does not light the dot on its own: it rarely clears the same day.
                const hasAction = !!bell && (bell.newOrders + bell.unpaidToday + bell.newMessages + bell.openTickets + bell.pendingReturns + bell.pendingReviews) > 0;
                return (
                  <div className="relative bell-menu-container">
                    <button
                      onClick={() => setShowBell(v => !v)}
                      aria-label={hasAction ? 'Notifications (items waiting)' : 'Notifications'}
                      aria-expanded={showBell}
                      aria-haspopup="true"
                      className="relative w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <i className="ri-notification-3-line text-xl"></i>
                      {hasAction && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
                    </button>
                    {showBell && (
                      <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                          <p className="text-sm font-semibold text-gray-900">Waiting for you</p>
                          {bell && bell.newOrders > 0 && (
                            <button onClick={markBellSeen} className="text-xs text-gray-700 underline hover:text-gray-900 cursor-pointer">Mark orders seen</button>
                          )}
                        </div>
                        {!bell ? (
                          <p className="px-4 py-4 text-sm text-gray-500">Loading...</p>
                        ) : items.length === 0 ? (
                          <p className="px-4 py-4 text-sm text-gray-500">Nothing needs attention right now.</p>
                        ) : (
                          <ul className="divide-y divide-gray-100">
                            {items.map(i => (
                              <li key={i.label}>
                                <Link
                                  href={i.href}
                                  onClick={() => setShowBell(false)}
                                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-sm text-gray-700"
                                >
                                  <i className={`${i.icon} text-lg text-gray-500`}></i>
                                  <span><span className="font-semibold text-gray-900">{i.n}</span> {i.label}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="relative user-menu-container">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 lg:space-x-3 px-2 lg:px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 lg:w-9 lg:h-9 flex items-center justify-center bg-gray-100 text-gray-900 rounded-full font-semibold">
                    {user?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-semibold text-gray-900 capitalize">{userRole || 'Admin'}</p>
                    <p className="text-xs text-gray-500 max-w-[100px] truncate">{user?.email}</p>
                  </div>
                  <i className="ri-arrow-down-s-line text-gray-600"></i>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors border-t border-gray-200 text-left cursor-pointer"
                    >
                      <i className="ri-logout-box-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
                      <span className="text-red-600">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

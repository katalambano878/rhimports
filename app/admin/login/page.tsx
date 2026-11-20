'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function AdminLoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams?.get('error');
  const sessionExpired = urlError === 'session_expired' || searchParams?.get('expired') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Only follow a redirect back into the dashboard: a same-site path under /admin,
  // never a protocol-relative (//host) or absolute URL, and never the login page itself.
  const safeRedirect = (): string => {
    const raw = searchParams?.get('redirect') || '';
    if (!raw.startsWith('/admin') || raw.startsWith('//') || raw.includes('\\')) return '/admin';
    try {
      const url = new URL(raw, window.location.origin);
      const inAdmin = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
      if (url.origin !== window.location.origin || !inAdmin || url.pathname.startsWith('/admin/login')) return '/admin';
      return url.pathname + url.search + url.hash;
    } catch {
      return '/admin';
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.session) {
        // Full page navigation so the server-side /admin check sees the new
        // session cookie and the layout starts with the new session.
        window.location.assign(safeRedirect());
        return;
      }
    } catch (err: any) {
      const msg = err?.message || 'Login failed';
      const lower = msg.toLowerCase();
      if (lower.includes('email') && lower.includes('confirm')) {
        setError(`${msg} Check your inbox for the confirmation link, or ask an admin to confirm your account.`);
      } else if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
        setError('Wrong email or password.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.png" alt="Store Logo" className="h-12 w-auto mx-auto" />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2">Admin Login</h1>
          <p className="text-gray-600">Sign in to access the admin dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {sessionExpired && !error && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3" role="status">
              <i className="ri-time-line text-amber-600 text-xl mt-0.5"></i>
              <p className="text-amber-800 text-sm">Your session expired, please sign in again.</p>
            </div>
          )}
          {urlError === 'unauthorized' && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3">
              <i className="ri-shield-user-line text-amber-600 text-xl mt-0.5"></i>
              <div>
                <p className="text-amber-800 font-semibold">No admin access</p>
                <p className="text-amber-700 text-sm mt-1">
                  Your account does not have dashboard access. If you work here, ask an admin to give your account staff access, then sign in again.
                </p>
              </div>
            </div>
          )}
          {urlError === 'no_profile' && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3">
              <i className="ri-user-search-line text-amber-600 text-xl mt-0.5"></i>
              <div>
                <p className="text-amber-800 font-semibold">Profile not found</p>
                <p className="text-amber-700 text-sm mt-1">
                  Your account was found but its staff profile is missing. Ask an admin to give your account staff access, then sign in again.
                </p>
              </div>
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <i className="ri-error-warning-line text-red-600 text-xl mt-0.5"></i>
              <div>
                <p className="text-red-800 font-semibold">Login Failed</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="admin-email" className="block text-sm font-semibold text-gray-900 mb-2">
                Email Address
              </label>
              <div className="relative">
                <i className="ri-mail-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  id="admin-email"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-sm font-semibold text-gray-900 mb-2">
                Password
              </label>
              <div className="relative">
                <i className="ri-lock-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i>
                <input
                  id="admin-password"
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading ? (
                <span className="flex items-center justify-center space-x-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  <span>Signing in...</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Admin access is restricted to users with admin/staff role */}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Store
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AdminLoginForm />
    </Suspense>
  );
}

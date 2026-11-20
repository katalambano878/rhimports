'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { safeInternalPath } from '../safe-next';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [redirectTo, setRedirectTo] = useState('/account');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const { getToken, verifying } = useRecaptcha();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirectTo(safeInternalPath(params.get('redirect') || params.get('next'), '/account'));
    if (params.get('changed') === '1') {
      setNotice('Password changed. Please sign in with your new password.');
    } else if (params.get('reset') === 'success') {
      setNotice('Password changed. Please sign in again with your new password.');
    } else if (params.get('verified') === '1') {
      setNotice('Your email is confirmed. Sign in to continue.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setAuthError('');
    setIsLoading(true);

    // Validation
    const newErrors: any = {};
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsLoading(false);
      return;
    }

    // reCAPTCHA verification
    const isHuman = await getToken('login');
    if (!isHuman) {
      setAuthError('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        router.push(redirectTo);
        router.refresh(); // Refresh to update auth state in other components
      }
    } catch (error: any) {
      console.error('Login error:', error);
      // Show the server's message (wrong password, too many attempts, …).
      setAuthError(error?.message || 'The request could not be completed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl px-8 py-10 sm:px-10 sm:py-12">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
              Welcome Back
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Sign in to your account to continue
            </p>
          </div>

          {notice && !authError && (
            <div role="status" className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm flex items-start gap-2">
              <i className="ri-checkbox-circle-fill text-lg mt-0.5" aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

          {authError && (
            <div role="alert" className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
              <i className="ri-error-warning-fill text-lg mt-0.5" aria-hidden="true" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-gray-900"
                htmlFor="email"
              >
                Email Address
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-lg outline-none text-sm placeholder:text-gray-400 transition-all focus:bg-white focus:ring-2 focus:ring-primary/20 ${errors.email
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-primary'
                    }`}
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 mt-0.5">{errors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  className="text-sm font-medium text-gray-900"
                  htmlFor="password"
                >
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-medium text-primary hover:text-primary-dark"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-lg outline-none text-sm placeholder:text-gray-400 transition-all focus:bg-white focus:ring-2 focus:ring-primary/20 ${errors.password
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-primary'
                    }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i
                    className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'}
                  />
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-0.5">
                  {errors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || verifying}
              className="mt-1 w-full inline-flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading || verifying ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2" />
                  <span>{verifying ? 'Verifying...' : 'Signing in...'}</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8">
            <p className="text-center text-sm text-gray-500">
              Don&apos;t have an account?{' '}
              <Link
                href={redirectTo !== '/account' ? `/auth/signup?redirect=${encodeURIComponent(redirectTo)}` : '/auth/signup'}
                className="font-semibold text-primary hover:text-primary-dark"
              >
                Create one now
              </Link>
            </p>

            <div className="mt-4 flex justify-center">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <i className="ri-arrow-left-line" />
                <span>Back to Home</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

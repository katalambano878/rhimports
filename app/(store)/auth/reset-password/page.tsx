'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type LinkState = 'checking' | 'ready' | 'invalid';

/**
 * Read the emailed link before supabase-js clears the URL fragment. Only a
 * recovery link (type=recovery) may set a new password here; an ordinary
 * signed-in session must use the account page, which asks for the current one.
 */
const ARRIVED_WITH_RECOVERY_LINK =
  typeof window !== 'undefined' && /(^|[#&])type=recovery(&|$)/.test(window.location.hash);

export default function ResetPasswordPage() {
  const router = useRouter();
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    // The emailed link signs the user in through the URL fragment; supabase-js
    // reads it on load. An expired link arrives as #error=...
    if (window.location.hash.includes('error=')) {
      setLinkState('invalid');
      return;
    }
    let settled = false;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === 'PASSWORD_RECOVERY') {
        settled = true;
        setLinkState('ready');
      }
    });
    if (ARRIVED_WITH_RECOVERY_LINK) {
      // The link's session is saved while supabase-js starts up; wait for it.
      const check = async () => {
        for (let i = 0; i < 16 && !settled; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            settled = true;
            setLinkState('ready');
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      };
      void check();
    }
    const timer = setTimeout(() => {
      if (!settled) setLinkState('invalid');
    }, ARRIVED_WITH_RECOVERY_LINK ? 5000 : 1500);
    return () => {
      clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setIsLoading(false);
      setError('Could not update your password. Please request a new reset link.');
      return;
    }
    // The server ends every session after a password change, this one included.
    await supabase.auth.signOut({ scope: 'local' });
    setIsLoading(false);
    setIsDone(true);
    setTimeout(() => {
      router.push('/auth/login?reset=success');
      router.refresh();
    }, 1500);
  };

  if (linkState === 'invalid') {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
              <i className="ri-link-unlink text-3xl text-gray-900" aria-hidden="true"></i>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Link Expired</h1>
            <p className="text-gray-600 mb-8">
              This password reset link is invalid or has expired. Reset links work once and last for 1 hour. To change your password while signed in, use the Profile tab in your account.
            </p>
            <Link
              href="/auth/forgot-password"
              className="inline-block bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
            >
              Request a New Link
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (isDone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
              <i className="ri-check-line text-3xl text-gray-900"></i>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Password Updated</h1>
            <p className="text-gray-600">Taking you to sign in with your new password…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Choose a New Password</h1>
          <p className="text-gray-600">Enter a new password for your account</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold text-gray-900 mb-2">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={linkState !== 'ready'}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-gray-900 mb-2">
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={linkState !== 'ready'}
                className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 ${
                  error ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Re-enter your new password"
              />
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading || linkState !== 'ready'}
              className="w-full bg-primary hover:bg-primary-dark text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {linkState === 'checking' ? 'Checking link...' : isLoading ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

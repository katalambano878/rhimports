'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      window.location.href = '/';
    }
  }, [isOnline]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <i className="ri-wifi-off-line text-5xl text-gray-400" aria-hidden="true"></i>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          You&apos;re Offline
        </h1>
        
        <p className="text-gray-600 mb-8">
          It looks like you&apos;ve lost your internet connection. The shop needs a connection to load products and take orders.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <i className="ri-information-line text-xl text-blue-600" aria-hidden="true"></i>
            </div>
            <h2 className="font-semibold text-blue-900">Nothing is lost</h2>
          </div>
          <p className="text-blue-800">
            Your cart is saved on this device. Reconnect and this page takes you back to the shop.
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-primary hover:bg-primary-dark text-white py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <i className="ri-refresh-line"></i>
            Try Again
          </button>

          <Link
            href="/"
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <i className="ri-home-line"></i>
            Go to Homepage
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Connection status: <span className={isOnline ? 'text-gray-900 font-semibold' : 'text-red-600 font-semibold'}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
'use client';

import { useState, useEffect } from 'react';

export default function PWAPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);

      const lastPromptTime = localStorage.getItem('pwaPromptTime');
      const daysSinceLastPrompt = lastPromptTime 
        ? (Date.now() - parseInt(lastPromptTime)) / (1000 * 60 * 60 * 24)
        : 999;

      if (daysSinceLastPrompt > 7) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('PWA installed');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
    localStorage.setItem('pwaPromptTime', Date.now().toString());
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwaPromptTime', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-xl shadow-2xl p-6 z-50 border border-gray-200 animate-slide-up">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <i className="ri-smartphone-line text-2xl text-gray-900"></i>
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 mb-2">Add to Home Screen</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add RNH Imports to your home screen to open the shop in one tap. You still need an internet connection to shop.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleInstall}
              className="flex-1 bg-primary hover:bg-primary-dark text-white py-2 px-4 rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              Install Now
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
            >
              Not Now
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={handleDismiss}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
        >
          <i className="ri-close-line" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  );
}
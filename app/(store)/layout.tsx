'use client';

import { Suspense } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import ScrollToTop from '@/components/ScrollToTop';
import ErrorBoundary from '@/components/ErrorBoundary';
import NavigationProgress from '@/components/NavigationProgress';
import { CMSProvider } from '@/context/CMSContext';

// Lazy-load non-critical components
import dynamic from 'next/dynamic';
const SessionTimeoutWarning = dynamic(() => import('@/components/SessionTimeoutWarning'), { ssr: false });
const PWAPrompt = dynamic(() => import('@/components/PWAPrompt'), { ssr: false });
const PWAInstaller = dynamic(() => import('@/components/PWAInstaller'), { ssr: false });
// const PushNotificationManager = dynamic(() => import('@/components/PushNotificationManager'), { ssr: false });
const OfflineIndicator = dynamic(() => import('@/components/OfflineIndicator'), { ssr: false });
const NetworkStatusMonitor = dynamic(() => import('@/components/NetworkStatusMonitor'), { ssr: false });
const UpdatePrompt = dynamic(() => import('@/components/UpdatePrompt'), { ssr: false });
const LiveSalesNotification = dynamic(() => import('@/components/LiveSalesNotification'), { ssr: false });
const PreorderPopup = dynamic(() => import('@/components/PreorderPopup'), { ssr: false });
const WhatsAppButton = dynamic(() => import('@/components/WhatsAppButton'), { ssr: false });
const WhatsAppAnnouncementBanner = dynamic(() => import('@/components/WhatsAppAnnouncementBanner'), { ssr: false });

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CMSProvider>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <ScrollToTop />
      <div className="min-h-screen bg-surface-subtle">
        <PWAInstaller />
        <WhatsAppAnnouncementBanner />
        <Header />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Footer />
        <MobileBottomNav />
        <SessionTimeoutWarning />
        <PWAPrompt />
        {/* <PushNotificationManager /> */}
        <OfflineIndicator />
        <NetworkStatusMonitor />
        <UpdatePrompt />
        <LiveSalesNotification />
        <PreorderPopup />
        <WhatsAppButton />
      </div>
    </CMSProvider>
  );
}

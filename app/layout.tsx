import type { Metadata } from "next";
import Script from "next/script";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import "./globals.css";
import { ConsentedAnalytics } from "@/components/CookieConsent";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com';
const siteName = 'RNH Imports';
const siteTagline = 'Premium Electronics, Imported for Ghana';
const siteDescription =
  'RNH Imports is a Ghanaian electronics import company. We source genuine laptops, phones, tablets, cameras, gaming consoles and audio gear from verified suppliers abroad, mostly as preorders delivered 45–60 days after you order. Pay online with mobile money or card, doorstep delivery in Ghana, WhatsApp support.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — ${siteTagline}`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    'RNH Imports',
    'RNH Imports Ghana',
    'electronics Ghana',
    'imported electronics Accra',
    'buy laptops Ghana',
    'buy phones Ghana',
    'iPads Ghana',
    'tablets Ghana',
    'Sony cameras Ghana',
    'Beats headphones Ghana',
    'Xbox Ghana',
    'PlayStation Ghana',
    'gaming consoles Ghana',
    'Apple products Ghana',
    'Samsung Galaxy Ghana',
    'MacBook Pro Ghana',
    'genuine electronics Accra',
    'China imports Ghana',
    'electronics importation Ghana',
    'phones tablets Amasaman',
    'wholesale electronics Ghana',
    'audio equipment Ghana',
    'smart watches Ghana',
    'tech accessories Ghana',
    'online electronics store Ghana',
    'electronics delivery Accra',
    'electronics delivery Kumasi',
    'affordable electronics Ghana',
    'original gadgets Ghana',
  ],
  authors: [{ name: siteName, url: siteUrl }],
  creator: siteName,
  publisher: siteName,
  category: 'Shopping',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: '/favicon.ico',
    other: [
      { rel: 'mask-icon', url: '/safari-pinned-tab.png', color: '#1B2A6B' },
    ],
  },
  manifest: '/manifest.webmanifest',
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
  },
  openGraph: {
    type: 'website',
    locale: 'en_GH',
    url: siteUrl,
    title: `${siteName} — ${siteTagline}`,
    description: siteDescription,
    siteName: siteName,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${siteName} — Premium Electronics, Imported for Ghana`,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} — ${siteTagline}`,
    description: siteDescription,
    images: [{ url: '/og-image.png', alt: `${siteName} — Premium Electronics, Imported for Ghana` }],
  },
  other: {
    'theme-color': '#1B2A6B',
    'msapplication-TileColor': '#1B2A6B',
    'msapplication-TileImage': '/mstile-150x150.png',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': siteName,
    'format-detection': 'telephone=no',
  },
};

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

/** JSON-LD inside <script>: escape "<" so no value can close the tag. */
function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  "name": siteName,
  "url": siteUrl,
  "logo": {
    "@type": "ImageObject",
    "url": `${siteUrl}/logo.png`,
    "width": 311,
    "height": 368,
  },
  "image": `${siteUrl}/og-image.png`,
  "description": siteDescription,
  "foundingDate": "2023",
  "foundingLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Amasaman",
      "addressRegion": "Greater Accra",
      "addressCountry": "GH",
    },
  },
  "contactPoint": [
    {
      "@type": "ContactPoint",
      "telephone": "+233-24-220-5331",
      "contactType": "customer service",
      "areaServed": "GH",
      "availableLanguage": ["English", "Twi"],
    },
  ],
  "sameAs": [
    "https://wa.me/233242205331",
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  "name": siteName,
  "url": siteUrl,
  "description": siteDescription,
  "inLanguage": "en",
  "publisher": { "@id": `${siteUrl}/#organization` },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": `${siteUrl}/shop?search={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const storeSchema = {
  "@context": "https://schema.org",
  "@type": "Store",
  "@id": `${siteUrl}/#store`,
  "name": siteName,
  "description": siteDescription,
  "url": siteUrl,
  "image": `${siteUrl}/og-image.png`,
  "logo": `${siteUrl}/logo.png`,
  "telephone": "+233-24-220-5331",
  "email": "info@rnhimports.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Amasaman",
    "addressLocality": "Accra",
    "addressRegion": "Greater Accra",
    "postalCode": "00233",
    "addressCountry": "GH",
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "5.7015",
    "longitude": "-0.3027",
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "09:00",
      "closes": "18:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Saturday",
      "opens": "10:00",
      "closes": "16:00",
    },
  ],
  "priceRange": "$$",
  "currenciesAccepted": "GHS",
  "paymentAccepted": "Mobile Money, Card",
  "areaServed": {
    "@type": "Country",
    "name": "Ghana",
  },
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Electronics Catalogue",
    "itemListElement": [
      { "@type": "OfferCatalog", "name": "Laptops" },
      { "@type": "OfferCatalog", "name": "Smartphones" },
      { "@type": "OfferCatalog", "name": "Tablets" },
      { "@type": "OfferCatalog", "name": "Cameras" },
      { "@type": "OfferCatalog", "name": "Gaming Consoles" },
      { "@type": "OfferCatalog", "name": "Audio Equipment" },
      { "@type": "OfferCatalog", "name": "Wearables" },
      { "@type": "OfferCatalog", "name": "TVs & Displays" },
    ],
  },
  "potentialAction": {
    "@type": "OrderAction",
    "target": { "@type": "EntryPoint", "urlTemplate": `${siteUrl}/shop` },
    "deliveryMethod": "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Does RNH Imports sell genuine products?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Every product we sell is sourced from verified suppliers abroad. Most products are preorders, delivered 45–60 days after the order.",
      },
    },
    {
      "@type": "Question",
      "name": "Do you deliver across Ghana?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. We deliver to your door in Ghana. Our team contacts you with the delivery cost before delivery.",
      },
    },
    {
      "@type": "Question",
      "name": "How can I contact RNH Imports?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You can reach us via WhatsApp at 024 220 5331, email at info@rnhimports.com, or through our contact page. We respond Monday to Saturday.",
      },
    },
    {
      "@type": "Question",
      "name": "What products does RNH Imports sell?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "We sell laptops, smartphones, tablets, cameras, gaming consoles, audio equipment and tech accessories, imported from verified suppliers abroad.",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="msapplication-TileImage" content="/mstile-150x150.png" />

        <link
          href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css"
          rel="stylesheet"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout: fonts apply to all pages */}
        <link href="https://fonts.googleapis.com/css2?family=Pacifico&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(websiteSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(storeSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
      </head>

      {RECAPTCHA_SITE_KEY && (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="afterInteractive"
        />
      )}

      <body className="antialiased font-sans overflow-x-hidden">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[10000] focus:px-6 focus:py-3 focus:bg-primary focus:text-white focus:rounded-lg focus:font-semibold focus:shadow-lg"
        >
          Skip to main content
        </a>
        <CartProvider>
          <WishlistProvider>
            <div id="main-content">
              {children}
            </div>
            {/* Google Analytics: loaded only after the visitor accepts analytics cookies */}
            {GA_MEASUREMENT_ID && <ConsentedAnalytics measurementId={GA_MEASUREMENT_ID} />}
          </WishlistProvider>
        </CartProvider>
      </body>
    </html>
  );
}

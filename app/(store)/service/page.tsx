'use client';

import Link from 'next/link';
import { usePageTitle } from '@/hooks/usePageTitle';
import AnimatedSection from '@/components/AnimatedSection';

const SERVICE_PILLARS = [
  {
    icon: 'ri-global-line',
    title: 'Global Sourcing',
    subtitle:
      'We work with verified suppliers abroad to source genuine products at fair prices. Most items are preorders, delivered 45–60 days after the order.',
  },
  {
    icon: 'ri-shield-check-line',
    title: 'Quality Control',
    subtitle:
      'Products are reviewed and vetted through supplier checks and on-site validation before shipment.',
  },
  {
    icon: 'ri-truck-line',
    title: 'End-to-End Logistics',
    subtitle:
      'From container loading to offloading and local warehouse handling, we manage the full journey.',
  },
  {
    icon: 'ri-customer-service-2-line',
    title: 'Human Support',
    subtitle:
      'You get direct guidance from our team for product matching, import planning, and delivery updates.',
  },
];

const GALLERY_ITEMS = [
  {
    id: 'sourcing-partners',
    title: 'Supplier Relationship Building',
    subtitle: 'Partner visits and relationship management with international suppliers.',
    src: '/images/gallery/sourcing-partners.png',
  },
  {
    id: 'factory-meeting',
    title: 'Factory Product Meetings',
    subtitle: 'Reviewing products on-site to align specs and pricing before procurement.',
    src: '/images/gallery/factory-meeting.png',
  },
  {
    id: 'team-partner-review',
    title: 'Joint Quality Checks',
    subtitle: 'Collaborative quality validation with partner teams before dispatch.',
    src: '/images/gallery/team-partner-review.png',
  },
  {
    id: 'container-load',
    title: 'Container Loading Operations',
    subtitle: 'Structured loading process to keep cargo protected and traceable.',
    src: '/images/gallery/container-load.png',
  },
  {
    id: 'rnh-team-hq',
    title: 'RNH Team at HQ',
    subtitle: 'Our people and culture at the Ghana operations base.',
    src: '/images/gallery/rnh-team-hq.png',
  },
  {
    id: 'forklift-offload',
    title: 'Forklift Offloading',
    subtitle: 'Fast and safe offloading from container to warehouse.',
    src: '/images/gallery/forklift-offload.png',
  },
  {
    id: 'delivery-unload',
    title: 'Final Unloading',
    subtitle: 'Last-stage handling to prepare products for local distribution.',
    src: '/images/gallery/delivery-unload.png',
  },
  {
    id: 'factory-inspection',
    title: 'Production Floor Inspection',
    subtitle: 'Monitoring production conditions to maintain quality consistency.',
    src: '/images/gallery/factory-inspection.png',
  },
];

export default function ServicePage() {
  usePageTitle('Our Services');

  return (
    <div className="min-h-screen bg-white">
      <section className="relative overflow-hidden bg-[#0B1230] text-white pt-20 lg:pt-24 pb-14 lg:pb-16">
        <div className="absolute inset-0 opacity-35 pointer-events-none">
          <img
            src="/images/gallery/factory-meeting.png"
            alt="Factory product meetings — RNH Imports import operations"
            className="w-full h-full object-cover object-center"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1230] via-[#0B1230]/80 to-transparent pointer-events-none"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="max-w-3xl">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold tracking-[0.2em] uppercase text-white/80 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Our Services
            </span>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.04] tracking-tight mb-4">
              From sourcing to delivery, we handle it all.
            </h1>
            <p className="text-sm sm:text-base lg:text-lg text-white/65 leading-relaxed max-w-2xl font-light">
              We provide a complete import service: supplier verification, product vetting, shipping coordination,
              offloading, and local delivery support across Ghana.
            </p>
          </AnimatedSection>
        </div>
      </section>

      <section className="py-12 lg:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
            {SERVICE_PILLARS.map((item) => (
              <article
                key={item.title}
                className="bg-stone-50 border border-stone-100 rounded-2xl p-5 lg:p-6 hover:bg-white hover:shadow-lg transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <i className={`${item.icon} text-xl text-primary`} />
                </div>
                <h2 className="font-serif text-xl text-gray-900 mb-2">{item.title}</h2>
                <p className="text-sm text-gray-600 leading-relaxed font-light">{item.subtitle}</p>
              </article>
            ))}
          </AnimatedSection>
        </div>
      </section>

      <section className="py-12 lg:py-16 bg-stone-50 border-y border-stone-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="max-w-3xl mb-7 lg:mb-9">
            <span className="inline-block py-1 px-3 rounded-full bg-white text-gray-900 text-[10px] font-bold tracking-widest uppercase mb-3">
              Operations Gallery
            </span>
            <h2 className="text-3xl lg:text-4xl font-serif text-gray-900 mb-3">Real Work, Real Process</h2>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed font-light">
              These moments show how RNH Imports works behind the scenes to bring genuine products from global
              suppliers to customers in Ghana.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
            {GALLERY_ITEMS.map((item) => (
              <article
                key={item.id}
                className="group bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-sm hover:shadow-lg transition-all duration-300"
              >
                <div className="relative aspect-[4/5] bg-stone-100 overflow-hidden">
                  <img
                    src={item.src}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-serif text-lg text-gray-900 mb-1.5">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">{item.subtitle}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 lg:py-16 bg-stone-50 border-t border-stone-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14 items-center">
            <AnimatedSection className="lg:col-span-3">
              <span className="inline-block py-1 px-3 rounded-full bg-white border border-stone-200 text-gray-900 text-[10px] font-bold tracking-widest uppercase mb-4">
                Real Conversations
              </span>
              <h2 className="text-3xl lg:text-4xl font-serif text-gray-900 mb-4 leading-tight">
                The proof is in the chats.
              </h2>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed font-light mb-5 max-w-xl">
                We don&apos;t hide behind faceless support tickets. Every customer reaches a real human on WhatsApp — from the first product question to delivery confirmation. Here&apos;s a real conversation after one of our recent deliveries.
              </p>
              <ul className="space-y-2.5 text-sm text-gray-700">
                <li className="flex items-start gap-2.5">
                  <i className="ri-check-line text-emerald-600 text-base mt-0.5 flex-shrink-0" />
                  <span>Direct WhatsApp line — no bots, no queues.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <i className="ri-check-line text-emerald-600 text-base mt-0.5 flex-shrink-0" />
                  <span>Tracking updates and proof of delivery on every order.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <i className="ri-check-line text-emerald-600 text-base mt-0.5 flex-shrink-0" />
                  <span>Available Monday to Saturday, in plain English and Twi.</span>
                </li>
              </ul>
            </AnimatedSection>

            <AnimatedSection delay={0.1} className="lg:col-span-2">
              <div className="relative aspect-[4/5] max-w-sm mx-auto rounded-2xl overflow-hidden bg-white shadow-xl shadow-gray-200/70 border border-stone-100">
                <img
                  src="/images/reviews/whatsapp-feedback.png"
                  alt="WhatsApp conversation with an RNH Imports customer"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      <section className="py-14 lg:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <AnimatedSection className="bg-gradient-to-br from-[#1B2A6B] via-[#0F1A47] to-black rounded-2xl p-7 sm:p-9 lg:p-10 text-white">
            <h2 className="font-serif text-3xl lg:text-4xl mb-3 leading-tight">Need a reliable import partner?</h2>
            <p className="text-white/70 text-sm sm:text-base max-w-2xl mx-auto mb-6">
              Tell us what you need, and we will help you source and deliver with transparent communication at every step.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-white text-[#1B2A6B] px-6 py-3 rounded-full text-sm font-bold hover:bg-gray-100 transition-colors"
              >
                Contact Us <i className="ri-arrow-right-line" />
              </Link>
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 border border-white/25 bg-white/5 text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Browse Products
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </div>
  );
}

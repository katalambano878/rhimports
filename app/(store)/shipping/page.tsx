'use client';

import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';
import { toWhatsAppNumber } from '@/lib/contact';
import AnimatedSection from '@/components/AnimatedSection';

export default function ShippingPage() {
  const { getSetting } = useCMS();
  const contactPhone = getSetting('contact_phone') || '';
  const telHref = contactPhone && toWhatsAppNumber(contactPhone) ? `tel:+${toWhatsAppNumber(contactPhone)}` : '#';

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-gray-50 via-white to-amber-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">Shipping &amp; Delivery</h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              How delivery works, how long preorders take, and guide prices for doorstep delivery.
            </p>
          </AnimatedSection>
        </div>
      </div>

      <AnimatedSection direction="up" delay={0.1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8 space-y-8 prose prose-gray max-w-none hover-lift">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">How delivery works</h2>
              <ul className="list-disc pl-5 space-y-2 text-gray-700 m-0">
                <li>Most of our products are preorders, sourced from verified suppliers abroad after you order. Please allow 45–60 days from your order for delivery.</li>
                <li>Every order is delivered to your door. The delivery cost is not included in the amount you pay online.</li>
                <li>When your order is ready, our team contacts you with the delivery cost and to arrange delivery.</li>
                <li>You can check your order at any time on the <Link href="/order-tracking" className="text-gray-900 font-semibold hover:underline">Track Order</Link> page.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Guide prices: small packages</h2>
              <p className="text-gray-600 text-sm mt-0 mb-4">Our team confirms the exact cost for your order before delivery.</p>
              <ul className="list-none space-y-3 p-0 m-0">
                <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3 border-b border-gray-100">
                  <span className="text-gray-800 font-medium">Within Accra</span>
                  <span className="text-lg font-bold text-primary">GH₵ 50</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3 border-b border-gray-100">
                  <span className="text-gray-800 font-medium">Tema / Ashiaman</span>
                  <span className="text-lg font-bold text-primary">GH₵ 100</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3 border-b border-gray-100">
                  <span className="text-gray-800 font-medium">Pokuase / Amasaman</span>
                  <span className="text-lg font-bold text-primary">GH₵ 80</span>
                </li>
                <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3">
                  <span className="text-gray-800 font-medium">Station fee</span>
                  <span className="text-lg font-bold text-primary">GH₵ 10</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Big packages</h2>
              <p className="text-gray-800 text-lg font-semibold m-0">
                GH₵ 100 and above
              </p>
              <p className="text-gray-600 text-sm mt-2 mb-0">
                Large or heavy items are charged at this rate (or higher as agreed). Contact us if you’re unsure which category applies.
              </p>
            </div>

            <p className="text-gray-700 leading-relaxed mb-0">
              These are guide prices per delivery; other areas are quoted when we contact you. For questions, please contact us. {contactPhone && (
                <>Call us at <a href={telHref} className="text-gray-900 font-semibold hover:underline">{contactPhone}</a>.</>
              )}
            </p>
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-medium hover:bg-primary-dark transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              Contact us
            </Link>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}

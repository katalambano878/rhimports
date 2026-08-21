"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';
import AnimatedSection from '@/components/AnimatedSection';
import { DEFAULT_CONTACT_PHONE } from '@/lib/contact';

export default function FAQsPage() {
  const { getSetting } = useCMS();
  const contactEmail = getSetting('contact_email') || '';
  const contactPhone = getSetting('contact_phone') || DEFAULT_CONTACT_PHONE;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', name: 'All Questions', icon: 'ri-question-line' },
    { id: 'orders', name: 'Orders', icon: 'ri-shopping-bag-line' },
    { id: 'shipping', name: 'Shipping', icon: 'ri-truck-line' },
    { id: 'returns', name: 'Returns', icon: 'ri-arrow-go-back-line' },
    { id: 'payment', name: 'Payment', icon: 'ri-bank-card-line' },
    { id: 'account', name: 'Account', icon: 'ri-user-line' }
  ];

  const faqs = [
    {
      category: 'orders',
      question: 'How do I place an order?',
      answer: 'Browse our products, add items to your cart, proceed to checkout, provide your delivery address, select payment method, and confirm your order. You\'ll receive an email confirmation with your order details and tracking number.'
    },
    {
      category: 'orders',
      question: 'Can I modify or cancel my order?',
      answer: 'You can modify or cancel your order within 1 hour of placing it. Contact customer service via the contact page. Once an order is processed, modifications may not be possible.'
    },
    {
      category: 'orders',
      question: 'How do I track my order?',
      answer: 'After your order ships, you\'ll receive a tracking number via email and SMS. Visit our Order Tracking page and enter your order number and email address to see real-time updates on your delivery status.'
    },
    {
      category: 'orders',
      question: 'What if I receive the wrong or a defective item?',
      answer: 'We sincerely apologise if this happens. Contact us within 48 hours with photos or a short video showing the issue. We will arrange for the correct item to be sent or a full refund to be processed — at no extra cost to you.'
    },
    {
      category: 'orders',
      question: 'Are your products genuine?',
      answer: 'Yes. All products sold by RNH Imports are genuine, sourced directly from verified manufacturers and suppliers. We do not sell counterfeits. If you ever have concerns about a product\'s authenticity, contact us immediately and we will resolve it.'
    },
    {
      category: 'shipping',
      question: 'What are your delivery times?',
      answer: 'Delivery within Accra and nearby areas typically takes 1–3 business days after your order is confirmed. Remote areas outside Greater Accra may take longer. You can also walk in and collect from our Amasaman Achiaman, Annosel Junction location during business hours.'
    },
    {
      category: 'shipping',
      question: 'How much does shipping cost?',
      answer: 'Delivery rates vary by location. Within Accra: GH₵ 50. Tema / Ashiaman: GH₵ 100. Pokuase / Amasaman area: GH₵ 80. Large or heavy packages: GH₵ 100 and above. See our full Shipping page for details.'
    },
    {
      category: 'shipping',
      question: 'Can I pick up my order in person?',
      answer: 'Yes — walk-ins are welcome. We are located at Amasaman Achiaman, Annosel Junction, Accra. Open Mon – Fri: 9am – 6pm and Saturday: 10am – 4pm. Call or WhatsApp 0594 162 758 before coming to confirm stock availability.'
    },
    {
      category: 'shipping',
      question: 'What if nobody is home for delivery?',
      answer: 'Our delivery partner will attempt delivery twice. If unsuccessful, the package will be held at the nearest collection point for 5 days. You\'ll receive SMS and email notifications with collection instructions.'
    },
    {
      category: 'returns',
      question: 'What is your return policy?',
      answer: `Please review our Refund Policy page for full return eligibility, process, and timelines. Items should be unworn/unused, with tags and original packaging, and you will need proof of purchase. Contact us first on WhatsApp ${contactPhone} or ${contactEmail} so we can guide you through the approved return process.`
    },
    {
      category: 'returns',
      question: 'Which items cannot be returned?',
      answer: 'We cannot accept returns on items that have been opened, used, or where the original seal/packaging has been broken — unless the item is defective or not as described. Custom orders and software licences are non-returnable. All returns must be approved by us first.'
    },
    {
      category: 'returns',
      question: 'Who pays for return shipping?',
      answer: 'If you\'re returning due to a defect or our error, we cover return shipping. For change-of-mind returns, customers may pay return shipping. Free shipping on returns for defective items.'
    },
    {
      category: 'returns',
      question: 'Can I exchange an item instead of returning it?',
      answer: 'Yes. If you received the wrong model or a defective unit, select "Exchange" when initiating your return and we will send the correct item as soon as we receive yours. Contact us on WhatsApp first so we can confirm availability.'
    },
    {
      category: 'payment',
      question: 'What payment methods do you accept?',
      answer: 'We accept major credit and debit cards, digital wallets, and other methods. See checkout for options. All payments are processed securely.'
    },
    {
      category: 'payment',
      question: 'Is it safe to use my credit card on your site?',
      answer: 'Absolutely. We use industry-standard SSL encryption and partner with secure, PCI-DSS compliant payment processors. We never store your full card details on our servers.'
    },
    {
      category: 'payment',
      question: 'Can I pay in instalments?',
      answer: 'Payment plans may be available for larger purchases. Select "Pay in Instalments" at checkout if available. Configure in Admin → Settings.'
    },
    {
      category: 'payment',
      question: 'When will my payment be charged?',
      answer: 'For card and mobile money payments, you\'re charged immediately. For Cash on Delivery, you pay when you receive your order. If an item is out of stock, we\'ll refund you within 24 hours.'
    },
    {
      category: 'payment',
      question: 'How do refunds work?',
      answer: `If we don’t have the same item you purchased, a full refund will be made. We’ll notify you once we’ve received and inspected your return and whether the refund was approved. If approved, you’re refunded on your original payment method; your bank or card company may take extra time to process it. Contact us on WhatsApp ${contactPhone} or ${contactEmail} for any return questions.`
    },
    {
      category: 'account',
      question: 'Do I need an account to place an order?',
      answer: 'No, you can checkout as a guest. However, creating an account lets you track orders, save addresses, view purchase history, manage your wishlist, and receive exclusive offers. It only takes 30 seconds to sign up.'
    },
    {
      category: 'account',
      question: 'How do I reset my password?',
      answer: 'Click "Forgot Password" on the login page, enter your email address, and we\'ll send you a reset link. The link is valid for 1 hour. If you don\'t receive it, check your spam folder or contact support.'
    },
    {
      category: 'account',
      question: 'Can I have multiple delivery addresses?',
      answer: 'Yes! You can save multiple delivery addresses in your account. During checkout, simply select the address you want to use or add a new one. This is perfect for sending gifts or alternating between work and home.'
    },
    {
      category: 'account',
      question: 'How do I update my account information?',
      answer: 'Log in to your account and go to "Account Settings". You can update your name, email, phone number, password, and saved addresses. Changes are saved instantly and you\'ll receive a confirmation email.'
    },
    {
      category: 'account',
      question: 'What are loyalty points and how do they work?',
      answer: 'Earn points for every purchase. Points can be redeemed for discounts. Check your account dashboard for your balance and redemption options.'
    }
  ];

  const filteredFAQs = faqs.filter(faq => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory;
    const matchesSearch = searchQuery === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-gray-50 via-white to-amber-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="max-w-3xl mx-auto text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Find quick answers to common questions about ordering, shipping, returns, and more.
            </p>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for answers..."
                className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-full focus:ring-2 focus:ring-gray-600 focus:border-transparent text-sm shadow-lg"
              />
              <i className="ri-search-line absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-xl"></i>
            </div>
          </AnimatedSection>
        </div>
      </div>

      <AnimatedSection direction="up" delay={0.1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all whitespace-nowrap ${activeCategory === category.id
                  ? 'bg-primary text-white shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              <i className={`${category.icon} text-lg`}></i>
              {category.name}
            </button>
          ))}
        </div>

        {filteredFAQs.length > 0 ? (
          <div className="max-w-4xl mx-auto space-y-4">
            {filteredFAQs.map((faq, index) => (
              <details
                key={index}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover-lift"
              >
                <summary className="px-6 py-5 font-medium text-gray-900 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between">
                  <span className="flex-1 pr-4">{faq.question}</span>
                  <i className="ri-arrow-down-s-line text-xl text-gray-400"></i>
                </summary>
                <div className="px-6 pb-5 text-gray-600 leading-relaxed border-t border-gray-100 pt-4">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-search-line text-4xl text-gray-400"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-600">
              Try adjusting your search or browse different categories
            </p>
          </div>
        )}
      </AnimatedSection>

      <AnimatedSection className="bg-gradient-to-br from-primary to-primary-dark py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="ri-customer-service-2-line text-3xl text-white"></i>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Still Have Questions?</h2>
          <p className="text-xl text-gray-100 mb-8 leading-relaxed">
            Our customer service team is ready to help. Contact us and we'll respond within 24 hours.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-white text-gray-900 px-8 py-4 rounded-full font-medium hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <i className="ri-mail-line text-lg"></i>
              Contact Support
            </Link>
            <a
              href={`https://wa.me/233${(contactPhone || '').replace(/\s/g, '').replace(/^0/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white/20 text-white px-8 py-4 rounded-full font-medium hover:bg-white/30 transition-colors whitespace-nowrap"
            >
              <i className="ri-whatsapp-line text-lg"></i>
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.1} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Quick Links</h2>
          <p className="text-gray-600">Explore more helpful resources</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Link href="/shipping" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer hover-lift group">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-truck-line text-2xl text-gray-900"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Shipping Policy</h3>
            <p className="text-gray-600 leading-relaxed">
              Learn about delivery times, costs, and tracking your orders
            </p>
          </Link>

          <Link href="/returns" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer hover-lift group">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-arrow-go-back-line text-2xl text-gray-900"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Returns Policy</h3>
            <p className="text-gray-600 leading-relaxed">
              Understand our return process, timeframes, and refund policy
            </p>
          </Link>

          <Link href="/privacy" className="bg-gray-50 p-8 rounded-2xl hover:shadow-lg transition-all cursor-pointer hover-lift group">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <i className="ri-shield-check-line text-2xl text-gray-900"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Privacy & Security</h3>
            <p className="text-gray-600 leading-relaxed">
              See how we protect your personal information and data
            </p>
          </Link>
        </div>
      </AnimatedSection>
    </div>
  );
}

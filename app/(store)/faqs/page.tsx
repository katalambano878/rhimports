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
      answer: 'Browse our products, add items to your cart, go to checkout, enter your delivery details and pay online. You get an order number after payment. Keep it: you need it to track the order or ask about it.'
    },
    {
      category: 'orders',
      question: 'What is a preorder, and how long does it take?',
      answer: 'Most of our products are preorders. When you order and pay, we buy the item from one of our verified suppliers abroad and ship it to Ghana for you. Please allow 45–60 days from the day you order for the item to reach you.'
    },
    {
      category: 'orders',
      question: 'Can I modify or cancel my order?',
      answer: `Contact us as soon as possible on WhatsApp ${contactPhone} with your order number. Because preorder items are bought from our suppliers after you order, we may not be able to change or cancel an order once it has been placed with the supplier. We will tell you what is possible.`
    },
    {
      category: 'orders',
      question: 'How do I track my order?',
      answer: 'Open the Track Order page and enter your order number with the contact details you used at checkout to see the current status. If you have an account, the orders you placed while signed in are also listed under My Account → Orders.'
    },
    {
      category: 'orders',
      question: 'What if I receive the wrong or a defective item?',
      answer: 'We sincerely apologise if this happens. Contact us within 48 hours of delivery with photos or a short video showing the issue, or start a request on the Returns page. We will review it and arrange a replacement or a refund.'
    },
    {
      category: 'orders',
      question: 'Are your products genuine?',
      answer: 'Yes. All products sold by RNH Imports are genuine, sourced from verified suppliers. We do not sell counterfeits. If you ever have concerns about a product\'s authenticity, contact us immediately and we will resolve it.'
    },
    {
      category: 'shipping',
      question: 'What are your delivery times?',
      answer: 'Preorder items are delivered 45–60 days after the order. When your order is ready, our team contacts you to arrange delivery to your door.'
    },
    {
      category: 'shipping',
      question: 'How much does delivery cost?',
      answer: 'Delivery is to your door and is not included in the amount you pay online. The cost depends on your location and the size of the package. Our team contacts you with the delivery cost before delivery. See our Shipping page for guide prices.'
    },
    {
      category: 'shipping',
      question: 'Where are you located?',
      answer: `We are at Amasaman Achiaman, Annosel Junction, Accra. Open Mon – Fri: 9am – 6pm and Saturday: 10am – 4pm. Call or WhatsApp ${contactPhone} before visiting.`
    },
    {
      category: 'returns',
      question: 'What is your return policy?',
      answer: `Returns must be started within 7 days of delivery. Items should be unused and in their original condition, with all accessories and original packaging, and you will need proof of purchase. Start a request on the Returns page or contact us on WhatsApp ${contactPhone}${contactEmail ? ` or ${contactEmail}` : ''}. See our Refund Policy for full details.`
    },
    {
      category: 'returns',
      question: 'Which items cannot be returned?',
      answer: 'We cannot accept returns on items that have been opened, used, or where the original seal or packaging has been broken, unless the item is defective or not as described. Custom or special orders and software licences are non-returnable. All returns must be approved by us first.'
    },
    {
      category: 'returns',
      question: 'Can I exchange an item instead of returning it?',
      answer: 'If you received the wrong model or a faulty unit, start a return and tell us you would like an exchange. Once your return is accepted we will arrange the exchange for the same item. You cannot exchange for a different product.'
    },
    {
      category: 'payment',
      question: 'What payment methods do you accept?',
      answer: 'All orders are paid online through Hubtel, with mobile money or a bank card. We do not offer cash on delivery or payment in instalments.'
    },
    {
      category: 'payment',
      question: 'Is it safe to pay on your site?',
      answer: 'Yes. Payments are handled on the secure pages of our payment provider, Hubtel. We never see or store your card details.'
    },
    {
      category: 'payment',
      question: 'When will my payment be charged?',
      answer: 'You pay in full when you place the order. Your order is confirmed once the payment provider tells us the payment went through. Delivery is paid separately: our team contacts you with the delivery cost.'
    },
    {
      category: 'payment',
      question: 'How do refunds work?',
      answer: `We review every return. Once we have received and checked the item we tell you whether the refund is approved. Approved refunds are paid back to the payment method you used; your mobile money or card provider may take a few days to show it. Contact us on WhatsApp ${contactPhone} for any refund question.`
    },
    {
      category: 'account',
      question: 'Do I need an account to place an order?',
      answer: 'No, you can check out as a guest. With an account you can see the orders you place while signed in, save delivery addresses and send support tickets.'
    },
    {
      category: 'account',
      question: 'How do I reset my password?',
      answer: 'Click "Forgot password" on the sign-in page, enter your email address, and we\'ll send you a reset link. The link works once and is valid for 1 hour. If you don\'t receive it, check your spam folder or contact us.'
    },
    {
      category: 'account',
      question: 'Can I save delivery addresses?',
      answer: 'Yes. Sign in and open My Account → Addresses to add, edit or delete addresses and choose a default.'
    },
    {
      category: 'account',
      question: 'How do I update my account information?',
      answer: 'Sign in and open My Account. On the Profile tab you can update your name and phone number, and change your password (you will need your current password). Your email address cannot be changed there; contact us if it needs to change.'
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
                aria-label="Search frequently asked questions"
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
            Our team is ready to help. Contact us and we'll reply during opening hours.
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

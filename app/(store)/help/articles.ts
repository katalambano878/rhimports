/**
 * Help centre articles. Keep every answer in line with how the shop really works:
 * most products are preorders sourced from verified suppliers abroad and arrive
 * 45–60 days after the order; payment is online only, through Hubtel (mobile
 * money or card) or Moolre (mobile money); no cash on delivery, no instalments,
 * no loyalty points; doorstep delivery, and our team contacts you with the
 * delivery cost; returns start within 7 days of delivery.
 */

export const STORE_PHONE = '024 220 5331';
export const STORE_PHONE_TEL = '+233242205331';
export const STORE_WHATSAPP = 'https://wa.me/233242205331';
export const STORE_EMAIL = 'info@rnhimports.com';

export type HelpSection = {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
};

export type HelpArticle = {
  id: string;
  category: HelpCategoryId;
  title: string;
  summary: string;
  sections: HelpSection[];
  links?: { href: string; label: string }[];
};

export type HelpCategoryId = 'ordering' | 'preorders' | 'payment' | 'delivery' | 'tracking' | 'returns' | 'account';

export const HELP_CATEGORIES: { id: HelpCategoryId; title: string; icon: string }[] = [
  { id: 'ordering', title: 'Ordering', icon: 'ri-shopping-bag-line' },
  { id: 'preorders', title: 'Preorders and timelines', icon: 'ri-time-line' },
  { id: 'payment', title: 'Paying online', icon: 'ri-bank-card-line' },
  { id: 'delivery', title: 'Delivery', icon: 'ri-truck-line' },
  { id: 'tracking', title: 'Tracking an order', icon: 'ri-map-pin-line' },
  { id: 'returns', title: 'Returns and refunds', icon: 'ri-arrow-left-right-line' },
  { id: 'account', title: 'Your account', icon: 'ri-user-line' },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'how-to-order',
    category: 'ordering',
    title: 'How do I place an order?',
    summary: 'Add items to your bag, enter your delivery details, then pay online.',
    sections: [
      {
        list: [
          'Find the item in the shop and choose an option (for example colour or storage) if the product has them.',
          'Tap "Add to Cart". You can keep shopping or open your cart to check out.',
          'At checkout, enter your name, phone number, email and delivery address.',
          'Pay online through Hubtel (mobile money or card) or with Moolre mobile money.',
          'After payment you get an order number. Keep it: you need it to track the order or ask about it.',
        ],
      },
      {
        paragraphs: ['You do not need an account to order. With an account you can see the orders you place while signed in and save delivery addresses.'],
      },
    ],
    links: [{ href: '/shop', label: 'Go to the shop' }],
  },
  {
    id: 'change-or-cancel-order',
    category: 'ordering',
    title: 'Can I change or cancel my order?',
    summary: 'Contact us as soon as possible with your order number.',
    sections: [
      {
        paragraphs: [
          `Call or WhatsApp us on ${STORE_PHONE} as soon as possible with your order number and tell us what you would like to change.`,
          'Most of our products are preorders that we buy from our suppliers after you order. Once an item has been ordered from the supplier we may not be able to change or cancel it. We will tell you what is possible for your order.',
        ],
      },
    ],
    links: [{ href: '/contact', label: 'Contact us' }],
  },
  {
    id: 'what-is-a-preorder',
    category: 'preorders',
    title: 'What is a preorder?',
    summary: 'Most of our products are sourced for you from verified suppliers abroad after you order.',
    sections: [
      {
        paragraphs: [
          'Most products in our shop are preorders. When you order and pay, we buy the item from one of our verified suppliers abroad and ship it to Ghana for you.',
          'The product page shows when an item is a preorder.',
        ],
      },
    ],
    links: [{ href: '/shop', label: 'Browse products' }],
  },
  {
    id: 'preorder-delivery-time',
    category: 'preorders',
    title: 'How long does a preorder take?',
    summary: 'Preorder items are delivered 45–60 days after the order.',
    sections: [
      {
        paragraphs: [
          'Please allow 45–60 days from the day you order for a preorder item to reach you. This covers buying the item from the supplier, shipping it to Ghana, customs clearance and delivery to your door.',
          `If your order is taking longer than 60 days, call or WhatsApp us on ${STORE_PHONE} with your order number.`,
        ],
      },
    ],
    links: [{ href: '/order-tracking', label: 'Track an order' }],
  },
  {
    id: 'how-to-pay',
    category: 'payment',
    title: 'How do I pay?',
    summary: 'All orders are paid online, through Hubtel (mobile money or card) or with Moolre mobile money.',
    sections: [
      {
        paragraphs: [
          'When you place an order you are taken to a secure payment page. With Hubtel you can pay with mobile money or a bank card. With Moolre you can pay with mobile money.',
          'Your order is confirmed once the payment provider tells us the payment went through. We never see or store your card details.',
        ],
      },
      {
        heading: 'What we do not offer',
        list: ['Cash on delivery', 'Paying in instalments', 'Loyalty points'],
      },
    ],
  },
  {
    id: 'payment-failed',
    category: 'payment',
    title: 'My payment did not go through',
    summary: 'Your order waits for payment. You can try again from your account or the payment link.',
    sections: [
      {
        paragraphs: [
          'If you closed the payment page, did not approve the mobile money prompt, or your card was declined, the order stays unpaid and we do not place it with our supplier.',
          'Check that you have enough balance and that you approved the prompt on your phone, then try again. If you have an account, open My Account → Orders and choose "Complete Payment".',
          `If money left your account but the order still shows as unpaid, do not pay twice. Call or WhatsApp us on ${STORE_PHONE} with your order number and we will check it with the payment provider.`,
        ],
      },
    ],
    links: [{ href: '/account?tab=orders', label: 'My orders' }],
  },
  {
    id: 'delivery-cost',
    category: 'delivery',
    title: 'How does delivery work, and what does it cost?',
    summary: 'We deliver to your door. Our team contacts you with the delivery cost.',
    sections: [
      {
        paragraphs: [
          'Every order is delivered to your door. The delivery cost depends on where you are and the size of the package, so it is not included in the amount you pay online.',
          'When your order is ready, our team contacts you on the phone number you gave at checkout with the delivery cost and to arrange delivery.',
          'Please make sure your phone number and address are correct so the rider can reach you.',
        ],
      },
    ],
    links: [{ href: '/shipping', label: 'Delivery information' }],
  },
  {
    id: 'track-your-order',
    category: 'tracking',
    title: 'How do I track my order?',
    summary: 'Use the order tracking page with your order number.',
    sections: [
      {
        paragraphs: [
          'Open the order tracking page and enter your order number with the contact details you used at checkout. You will see the current status of the order.',
          'If you have an account, the orders you placed while signed in are also listed under My Account → Orders.',
          'Preorder items take 45–60 days, so the status may stay the same for a while as the item is shipped to Ghana.',
        ],
      },
    ],
    links: [{ href: '/order-tracking', label: 'Track an order' }],
  },
  {
    id: 'start-a-return',
    category: 'returns',
    title: 'How do I return an item?',
    summary: 'Start a request on the returns page within 7 days of delivery.',
    sections: [
      {
        list: [
          'Open the returns page and enter your order number and the email or phone number used on the order.',
          'Choose a reason and tell us which item and what happened.',
          'Our team contacts you to agree the next step. Please do not send anything back before we have agreed it with you.',
        ],
      },
      {
        heading: 'Before you start',
        list: [
          'Start the request within 7 days of delivery.',
          'Items should be unused and in their original condition, with all accessories, manuals and packaging, unless they arrived damaged, faulty or wrong.',
          'Some items cannot be returned. The refund policy lists them.',
        ],
      },
    ],
    links: [
      { href: '/returns', label: 'Start a return' },
      { href: '/refund-policy', label: 'Refund policy' },
    ],
  },
  {
    id: 'refunds',
    category: 'returns',
    title: 'How do refunds work?',
    summary: 'If a refund is approved, it is paid back to the way you paid.',
    sections: [
      {
        paragraphs: [
          'We review every return. Once we have received and checked the item we tell you whether the refund is approved.',
          'Approved refunds are paid back to the payment method you used (your mobile money wallet or card). Your provider may take a few days to show it.',
        ],
      },
    ],
    links: [{ href: '/refund-policy', label: 'Refund policy' }],
  },
  {
    id: 'create-account',
    category: 'account',
    title: 'Do I need an account?',
    summary: 'No. An account lets you see your orders and save delivery addresses.',
    sections: [
      {
        paragraphs: [
          'You can order as a guest. With an account you can see the orders you place while signed in, save delivery addresses, update your name and phone number, and send support tickets.',
        ],
      },
    ],
    links: [{ href: '/auth/signup', label: 'Create an account' }],
  },
  {
    id: 'reset-password',
    category: 'account',
    title: 'I forgot my password',
    summary: 'Request a reset link on the forgot password page.',
    sections: [
      {
        paragraphs: [
          'On the sign-in page, choose "Forgot password", enter your email and open the link we send you. The link works once and lasts 1 hour. Check your spam folder if it does not arrive within a few minutes.',
          'To change a password you know, sign in and go to My Account → Profile → Change Password. You will need your current password.',
        ],
      },
    ],
    links: [{ href: '/auth/forgot-password', label: 'Reset my password' }],
  },
  {
    id: 'manage-addresses',
    category: 'account',
    title: 'How do I save delivery addresses?',
    summary: 'Add, edit and remove addresses under My Account → Addresses.',
    sections: [
      {
        paragraphs: [
          'Sign in and open My Account → Addresses. You can add several addresses, edit or delete them, and mark one as your default.',
        ],
      },
    ],
    links: [{ href: '/account?tab=addresses', label: 'My addresses' }],
  },
  {
    id: 'delete-account',
    category: 'account',
    title: 'Can I download my data or delete my account?',
    summary: 'Yes. Download a copy of your data or send us a deletion request from Privacy & data.',
    sections: [
      {
        paragraphs: [
          'Sign in and open My Account → Security → Privacy & data. You can download your profile, addresses and orders as a file.',
          'You can also send us an account deletion request there. Our team handles it by hand and contacts you to confirm. Records we must keep by law, such as paid orders, are kept.',
        ],
      },
    ],
    links: [{ href: '/account/privacy', label: 'Privacy & data' }],
  },
];

export function getHelpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}

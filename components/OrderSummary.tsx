
interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  variant?: string;
  variantId?: string;
  preorder?: boolean;
}

interface OrderSummaryProps {
  items: OrderItem[];
  subtotal: number;
  /** Kept for callers; delivery is never priced online (the team quotes it). */
  shipping?: number;
  tax?: number;
  total: number;
  /** Coupon discount already taken off `total`. */
  discount?: number;
  couponCode?: string;
}

const NO_IMAGE =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E%3C/svg%3E";

export default function OrderSummary({ items, subtotal, total, discount = 0, couponCode }: OrderSummaryProps) {
  const hasPreorder = items.some((item) => item.preorder);
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 sticky top-4">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>

      <div className="space-y-4 mb-6">
        {items.map((item) => (
          <div key={`${item.id}-${item.variantId || item.variant || 'novar'}`} className="flex space-x-4">
            <div className="relative w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={item.image || NO_IMAGE}
                alt={item.name}
                className="w-full h-full object-cover"
              />
              <div aria-hidden="true" className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-gray-900 text-white text-xs font-bold rounded-full">
                {item.quantity}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{item.name}</h3>
              {item.variant && <p className="text-xs text-gray-500 mt-0.5">{item.variant}</p>}
              {item.preorder && <p className="text-xs font-semibold text-amber-600 mt-0.5">Preorder</p>}
              <p className="text-gray-900 font-bold mt-1">
                <span className="sr-only">{item.quantity} × </span>GH₵ {item.price.toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-3">
        <div className="flex justify-between text-gray-700">
          <span>Subtotal</span>
          <span className="font-semibold">GH₵ {subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-gray-700">
            <span>
              Discount{couponCode ? <span className="ml-1 font-mono text-xs">({couponCode})</span> : null}
            </span>
            <span className="font-semibold text-emerald-700">− GH₵ {discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-700">
          <span>Delivery</span>
          <span className="font-semibold text-amber-600">At a cost</span>
        </div>
        <p className="text-xs text-gray-500">
          Delivery is not included. Our team will contact you with the delivery cost.
        </p>
      </div>

      <div className="border-t border-gray-200 mt-4 pt-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900">Total</span>
          <span className="text-2xl font-bold text-gray-900">GH₵ {total.toFixed(2)}</span>
        </div>
      </div>

      {hasPreorder && (
        <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Preorder items are sourced abroad after you order and usually arrive 45 – 60 days after the order is placed.
        </p>
      )}

      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center space-x-2 text-gray-800">
          <i className="ri-shield-check-line text-xl" aria-hidden="true"></i>
          <p className="text-sm font-semibold">Secure Checkout</p>
        </div>
      </div>
    </div>
  );
}

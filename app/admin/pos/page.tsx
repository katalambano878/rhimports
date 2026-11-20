'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

const STORE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'RNH Imports';
const POS_WALKIN_EMAIL = 'pos-walkin@store.local';
const PLACEHOLDER_IMAGE =
    'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2780%27 height=%2780%27 viewBox=%270 0 80 80%27%3E%3Crect width=%2780%27 height=%2780%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M24 54l10-12 8 9 6-7 8 10z%27 fill=%27%23d1d5db%27/%3E%3Ccircle cx=%2730%27 cy=%2730%27 r=%275%27 fill=%27%23d1d5db%27/%3E%3C/svg%3E';

interface ProductVariant {
    id: string;
    name: string;
    option1: string | null;
    option2: string | null;
    sku: string | null;
    price: number;
    quantity: number;
    image_url: string | null;
}

interface Product {
    id: string;
    name: string;
    price: number;
    quantity: number;
    category: string;
    image: string;
    sku: string;
    /** Preorder, continue-selling or untracked stock: may be sold past the stock count. */
    canOversell: boolean;
    isPreorder: boolean;
    variants: ProductVariant[];
}

interface CartItem {
    cartKey: string;
    productId: string;
    variantId?: string;
    variantName?: string;
    name: string;
    price: number;
    /** Stock on hand when added to the cart. */
    stock: number;
    canOversell: boolean;
    isPreorder: boolean;
    image: string;
    sku: string;
    cartQuantity: number;
}

interface Customer {
    id: string;
    full_name: string;
    email: string;
    phone?: string;
}

interface ReceiptItem {
    name: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
}

/** Money in pesewas (integer) so 12.10 x 3 is exactly 36.30. */
function toPesewas(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return NaN;
    return Math.round(n * 100);
}

const formatCedis = (amount: number) => `GH₵${(Math.round(Number(amount || 0) * 100) / 100).toFixed(2)}`;

/** One key per sale attempt; a retry of the same attempt reuses it so the server never sells twice. */
function newIdempotencyKey() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `pos_${crypto.randomUUID()}`;
    } catch {
        /* older browsers */
    }
    return `pos_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Strip characters that would break the search filter. */
function cleanSearchTerm(value: string) {
    return value.replace(/[,()*%\\"']/g, ' ').trim().slice(0, 60);
}

function getVariantLabel(variant: ProductVariant) {
    const left = variant.option2?.trim();
    const right = variant.option1?.trim() || variant.name?.trim();
    if (left && right) return `${left} / ${right}`;
    return left || right || variant.name || 'Variant';
}

export default function POSPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
    const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);

    // Checkout State
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerSearching, setCustomerSearching] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'momo'>('cash');
    const [amountTendered, setAmountTendered] = useState<string>('');
    const [processing, setProcessing] = useState(false);
    const [completedOrder, setCompletedOrder] = useState<any>(null);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const idempotencyKeyRef = useRef<string | null>(null);
    const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'doorstep'>('pickup');
    const [guestDetails, setGuestDetails] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        region: ''
    });

    const regions = [
        'Metro', 'Regional', 'Rural', 'Other',
    ];

    useEffect(() => {
        fetchData();
    }, []);

    // A changed cart, payment method or customer is a new sale attempt.
    // A retry of the same attempt (e.g. a failed Mobile Money link) keeps the key,
    // so the server returns the order it already saved instead of making another.
    useEffect(() => {
        idempotencyKeyRef.current = null;
    }, [cart, paymentMethod, selectedCustomer]);

    // Search customers in the database (not just the first page) by name, phone or email.
    useEffect(() => {
        if (!showCheckoutModal) return;
        let cancelled = false;
        const term = cleanSearchTerm(customerSearch);
        const timer = setTimeout(async () => {
            setCustomerSearching(true);
            try {
                let query = supabase.from('customers').select('id, full_name, email, phone');
                if (term) {
                    query = query.or(`full_name.ilike.*${term}*,phone.ilike.*${term}*,email.ilike.*${term}*`).order('full_name');
                } else {
                    query = query.order('updated_at', { ascending: false });
                }
                const { data, error } = await query.limit(25);
                if (!cancelled && !error) setCustomers((data as Customer[]) || []);
            } finally {
                if (!cancelled) setCustomerSearching(false);
            }
        }, term ? 300 : 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [customerSearch, showCheckoutModal]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setLoadError(null);
            // Only products that are on sale; drafts and archived items stay off the till.
            const { data: prodData, error } = await supabase
                .from('products')
                .select(`
          id, name, price, quantity, sku, track_quantity, continue_selling, metadata,
          categories(name),
          product_images(url, position),
          product_variants(id, name, option1, option2, sku, price, quantity, image_url)
        `)
                .eq('status', 'active')
                .order('name');

            if (error) throw error;

            const formatted: Product[] = (prodData || []).map((p: any) => {
                const imgs = ((p.product_images || []) as { url: string; position?: number }[])
                    .slice()
                    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
                const isPreorder = !!(p.metadata?.is_preorder ?? !!p.metadata?.preorder_shipping);
                return {
                    id: p.id,
                    name: p.name,
                    price: Number(p.price) || 0,
                    quantity: Number(p.quantity) || 0,
                    category: p.categories?.name || 'Uncategorized',
                    image: imgs[0]?.url || PLACEHOLDER_IMAGE,
                    sku: p.sku || '',
                    isPreorder,
                    canOversell: isPreorder || p.continue_selling === true || p.track_quantity === false,
                    variants: (p.product_variants || []).map((v: any) => ({
                        id: v.id,
                        name: v.name || '',
                        option1: v.option1 || null,
                        option2: v.option2 || null,
                        sku: v.sku || null,
                        price: Number(v.price ?? p.price ?? 0),
                        quantity: Number(v.quantity ?? 0),
                        image_url: v.image_url || null
                    }))
                };
            });
            setProducts(formatted);

            const cats = Array.from(new Set(formatted.map(p => p.category))).sort();
            setCategories(['All', ...cats]);
        } catch (error: any) {
            console.error('Error fetching POS data:', error);
            setLoadError(error?.message || 'Could not load products.');
        } finally {
            setLoading(false);
        }
    };

    const productStock = (product: Product) =>
        product.variants.length > 0
            ? product.variants.reduce((sum, v) => sum + (v.quantity || 0), 0)
            : product.quantity;

    // Cart Functions
    const addToCart = (product: Product, variant?: ProductVariant) => {
        const cartKey = variant ? `${product.id}:${variant.id}` : product.id;
        setCart(prev => {
            const existing = prev.find(item => item.cartKey === cartKey);
            if (existing) {
                return prev.map(item =>
                    item.cartKey === cartKey ? { ...item, cartQuantity: item.cartQuantity + 1 } : item
                );
            }
            return [...prev, {
                cartKey,
                productId: product.id,
                variantId: variant?.id,
                variantName: variant ? getVariantLabel(variant) : undefined,
                name: product.name,
                price: variant ? variant.price : product.price,
                stock: variant ? variant.quantity : product.quantity,
                canOversell: product.canOversell,
                isPreorder: product.isPreorder,
                image: variant?.image_url || product.image,
                sku: variant?.sku || product.sku,
                cartQuantity: 1
            }];
        });
    };

    const handleProductClick = (product: Product) => {
        if (product.variants.length > 0) {
            setVariantPickerProduct(product);
            return;
        }
        addToCart(product);
    };

    const removeFromCart = (cartKey: string) => {
        setCart(prev => prev.filter(item => item.cartKey !== cartKey));
    };

    const updateQuantity = (cartKey: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.cartKey === cartKey) {
                const newQty = item.cartQuantity + delta;
                return newQty > 0 ? { ...item, cartQuantity: newQty } : item;
            }
            return item;
        }));
    };

    const emptyCart = () => setCart([]);

    /** Lines asking for more than is in stock (preorder / continue-selling items excepted). */
    const overStockItems = cart.filter(item => !item.canOversell && item.cartQuantity > item.stock);

    // Computed
    const filteredProducts = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return products.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(q) ||
                p.sku?.toLowerCase().includes(q) ||
                p.variants.some(v => v.sku?.toLowerCase().includes(q));
            const matchesCat = activeCategory === 'All' || p.category === activeCategory;
            return matchesSearch && matchesCat;
        });
    }, [products, searchQuery, activeCategory]);

    // Server search results, keeping the chosen customer in the list.
    const filteredCustomers = useMemo(() => {
        if (selectedCustomer && !customers.some((c) => c.id === selectedCustomer.id)) {
            return [selectedCustomer, ...customers];
        }
        return customers;
    }, [customers, selectedCustomer]);

    // Money in pesewas so 12.10 x 3 is exactly 36.30.
    const cartTotalP = cart.reduce((sum, item) => sum + toPesewas(item.price) * item.cartQuantity, 0);
    const taxP = 0;
    const grandTotalP = cartTotalP + taxP;
    const cartTotal = cartTotalP / 100;
    const grandTotal = grandTotalP / 100;
    const tenderedP = amountTendered ? toPesewas(amountTendered) : NaN;
    const changeDue = Number.isFinite(tenderedP) ? (tenderedP - grandTotalP) / 100 : 0;

    const getOrderEmail = () => {
        if (selectedCustomer) return selectedCustomer.email || '';
        return guestDetails.email.trim();
    };

    const getOrderPhone = () => {
        if (selectedCustomer) return selectedCustomer.phone || '';
        return guestDetails.phone.trim();
    };

    const getCustomerFullName = () => {
        if (selectedCustomer) return selectedCustomer.full_name || '';
        return `${guestDetails.firstName} ${guestDetails.lastName}`.trim();
    };

    // Validate before checkout
    const validateCheckout = (): string | null => {
        if (cart.length === 0) return 'Cart is empty';

        if (paymentMethod === 'momo') {
            if (!getOrderPhone()) return 'Phone number is required for Mobile Money payment';
        }

        if (paymentMethod === 'cash') {
            if (!Number.isFinite(tenderedP) || tenderedP < grandTotalP) return 'Insufficient amount tendered';
        }

        if (!selectedCustomer) {
            const hasName = guestDetails.firstName.trim() || guestDetails.lastName.trim();
            const hasContact = guestDetails.email.trim() || guestDetails.phone.trim();
            if (!hasName && !hasContact) return 'Please enter customer name or contact info';
        }

        if (deliveryMethod === 'doorstep') {
            if (!guestDetails.address.trim()) return 'Delivery address is required';
            if (!guestDetails.city.trim()) return 'City is required for delivery';
            if (!guestDetails.region) return 'Region is required for delivery';
        }

        return null;
    };

    // Checkout: one server call prices, saves and (for cash/card) pays the sale,
    // reduces product and variant stock and updates the customer record.
    const handleCheckout = async () => {
        const validationError = validateCheckout();
        if (validationError) {
            setCheckoutError(validationError);
            return;
        }

        if (overStockItems.length > 0) {
            const list = overStockItems
                .map(i => `• ${i.name}${i.variantName ? ` (${i.variantName})` : ''}: selling ${i.cartQuantity}, ${Math.max(i.stock, 0)} in stock`)
                .join('\n');
            if (!window.confirm(`These items are more than the stock on record:\n\n${list}\n\nSell them anyway? Stock will go below zero.`)) {
                return;
            }
        }

        setProcessing(true);
        setCheckoutError(null);

        // Reuse the key when retrying the same attempt (e.g. after a network drop).
        if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
        const idempotencyKey = idempotencyKeyRef.current;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error('Your session has expired. Sign in again.');
            const authHeaders = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            };

            const customerEmail = getOrderEmail();
            const customerPhone = getOrderPhone();

            const res = await fetch('/api/admin/pos/checkout', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    idempotencyKey,
                    items: cart.map((item) => ({
                        productId: item.productId,
                        variantId: item.variantId || null,
                        quantity: item.cartQuantity,
                    })),
                    customer: selectedCustomer
                        ? {
                            existing: true,
                            name: selectedCustomer.full_name || '',
                            email: selectedCustomer.email || '',
                            phone: customerPhone,
                        }
                        : {
                            name: getCustomerFullName(),
                            firstName: guestDetails.firstName.trim(),
                            lastName: guestDetails.lastName.trim(),
                            email: guestDetails.email.trim(),
                            phone: customerPhone,
                        },
                    paymentMethod,
                    amountTendered: paymentMethod === 'cash' ? amountTendered : undefined,
                    delivery: {
                        method: deliveryMethod,
                        address: guestDetails.address,
                        city: guestDetails.city,
                        region: guestDetails.region,
                    },
                    expectedTotal: grandTotal,
                }),
            });
            const result = await res.json().catch(() => ({} as any));

            if (res.status === 409) {
                // The saved price differs from the one on screen: refresh the cart and let the cashier confirm.
                if (Array.isArray(result?.prices)) {
                    const priceFor = new Map<string, number>(
                        result.prices.map((p: { productId: string; variantId: string | null; unitPrice: number }) => [
                            `${p.productId}:${p.variantId || ''}`,
                            Number(p.unitPrice),
                        ])
                    );
                    setCart((prev) => prev.map((item) => {
                        const live = priceFor.get(`${item.productId}:${item.variantId || ''}`);
                        return live !== undefined && Number.isFinite(live) ? { ...item, price: live } : item;
                    }));
                }
                // Reload the product list so new prices also show on the tiles.
                fetchData();
                setCheckoutError(result?.error || 'A product price was updated. Check the total, then complete the sale again.');
                return;
            }
            if (!res.ok || !result?.order) {
                throw new Error(result?.error || `Checkout failed (${res.status}). Nothing was charged; try again.`);
            }

            const order = result.order;
            const orderNumber: string = order.order_number;
            const receiptItems: ReceiptItem[] = (result.items || []).map((it: any) => ({
                name: it.product_name,
                variantName: it.variant_name || undefined,
                quantity: Number(it.quantity),
                unitPrice: Number(it.unit_price),
                lineTotal: Number(it.total_price),
            }));
            const isCashOrCard = paymentMethod === 'cash' || paymentMethod === 'card';
            const baseReceipt = {
                id: order.id,
                orderNumber,
                total: Number(order.total),
                subtotal: Number(order.subtotal),
                createdAt: order.created_at,
                paymentMethod,
                items: receiptItems,
                customerName: getCustomerFullName(),
            };

            if (isCashOrCard) {
                setCompletedOrder({
                    ...baseReceipt,
                    amountTendered: result.amountTendered ?? (paymentMethod === 'cash' ? tenderedP / 100 : null),
                    changeDue: paymentMethod === 'cash'
                        ? (Number.isFinite(Number(result.changeDue)) ? Number(result.changeDue) : Math.max(changeDue, 0))
                        : 0,
                });
                setCart([]);
                idempotencyKeyRef.current = null;
                // Refresh stock counts on the tiles.
                fetchData();

                // Email confirmation for customers with a real address.
                const email = order.email || customerEmail;
                if (email && email !== POS_WALKIN_EMAIL && !email.endsWith('@pos.local')) {
                    fetch('/api/notifications', {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify({ type: 'order_created', payload: { ...order, email } })
                    }).catch(err => console.error('POS Notification error:', err));
                }
                return;
            }

            // Mobile Money: the order is saved as pending; start the Moolre payment link.
            const paymentRes = await fetch('/api/payment/moolre', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderNumber,
                    amount: Number(order.total),
                    customerEmail: order.email
                })
            });
            const paymentResult = await paymentRes.json().catch(() => ({} as any));
            if (!paymentResult?.success) {
                // Keep the key: retrying reuses this saved order instead of making another.
                throw new Error(
                    `Order #${orderNumber} is saved but the payment link failed: ${paymentResult?.message || 'unknown error'}. Press the button again to retry; no second order will be made.`
                );
            }

            setCompletedOrder({
                ...baseReceipt,
                paymentUrl: paymentResult.url,
                paymentPending: true
            });
            setCart([]);
            idempotencyKeyRef.current = null;
        } catch (error: any) {
            console.error('Checkout failed:', error);
            setCheckoutError(error?.message || 'Checkout failed. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    const resetCheckout = () => {
        idempotencyKeyRef.current = null;
        setShowCheckoutModal(false);
        setCompletedOrder(null);
        setAmountTendered('');
        setSelectedCustomer(null);
        setCustomerSearch('');
        setCheckoutError(null);
        setPaymentMethod('cash');
        setDeliveryMethod('pickup');
        setGuestDetails({
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            address: '',
            city: '',
            region: ''
        });
    };

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-90px)] -m-4 lg:-m-6 overflow-hidden bg-gray-100 relative">

            {/* LEFT: Product Grid */}
            <div className={`flex-1 flex flex-col h-full min-w-0 ${isMobileCartOpen ? 'hidden lg:flex' : 'flex'}`}>
                {/* Header / Search */}
                <div className="bg-white p-4 border-b border-gray-200 flex items-center justify-between space-x-4 shrink-0">
                    <div className="relative flex-1 max-w-lg">
                        <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 text-sm"
                            autoFocus
                        />
                    </div>
                    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === cat
                                    ? 'bg-primary text-white shadow-md'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid Area */}
                <div className="flex-1 overflow-y-auto p-4 content-start">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-gray-500">Loading products...</div>
                    ) : loadError ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
                            <i className="ri-error-warning-line text-4xl text-red-400"></i>
                            <p>{loadError}</p>
                            <button onClick={fetchData} className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-semibold hover:bg-primary">Try again</button>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <i className="ri-inbox-line text-4xl mb-2"></i>
                            <p>No products found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20 lg:pb-4">
                            {filteredProducts.map(product => (
                                <div
                                    key={product.id}
                                    onClick={() => handleProductClick(product)}
                                    className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden border border-gray-100 group flex flex-col h-full"
                                >
                                    <div className="aspect-square relative bg-gray-50 shrink-0">
                                        <img
                                            src={product.image}
                                            alt={product.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        />
                                        <div className={`absolute top-2 right-2 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm ${!product.canOversell && productStock(product) <= 0 ? 'bg-red-600/80' : 'bg-primary/60'}`}>
                                            {product.isPreorder ? 'Preorder' : `Qty: ${productStock(product)}`}
                                        </div>
                                        {product.variants.length > 0 && (
                                            <div className="absolute bottom-2 left-2 bg-white/90 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                                                {product.variants.length} options
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 flex flex-col flex-1">
                                        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-auto">{product.name}</h3>
                                        <div className="flex items-center justify-between mt-2 pt-2">
                                            <span className="text-gray-900 font-bold">{formatCedis(product.price)}</span>
                                            <button className="w-8 h-8 rounded-full bg-gray-50 text-gray-900 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                                                <i className="ri-add-line"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Mobile Bottom Cart Bar */}
                {cart.length > 0 && (
                    <div className="lg:hidden p-4 border-t border-gray-200 bg-white fixed bottom-0 left-0 right-0 z-30 shadow-2xl safe-area-bottom">
                        <button
                            onClick={() => setIsMobileCartOpen(true)}
                            className="w-full py-3 bg-primary text-white rounded-xl font-bold flex justify-between px-6 shadow-lg active:scale-95 transition-transform"
                        >
                            <span className="flex items-center text-sm">
                                <span className="bg-white/20 px-2 py-0.5 rounded mr-2">{cart.reduce((a, b) => a + b.cartQuantity, 0)}</span>
                                Items
                            </span>
                            <span>View Cart</span>
                            <span>{formatCedis(grandTotal)}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* RIGHT: Cart Panel */}
            <div className={`w-full lg:w-96 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg z-20 absolute inset-0 lg:relative ${isMobileCartOpen ? 'flex' : 'hidden lg:flex'}`}>
                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 shrink-0">
                    <div className="flex items-center">
                        <button onClick={() => setIsMobileCartOpen(false)} className="lg:hidden mr-3 p-2 -ml-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                            <i className="ri-arrow-left-line text-xl"></i>
                        </button>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center">
                            <i className="ri-shopping-basket-2-line mr-2"></i>
                            Current Order
                        </h2>
                    </div>
                    <span className="bg-gray-100 text-gray-800 text-xs font-bold px-2 py-1 rounded-full">
                        {cart.reduce((a, b) => a + b.cartQuantity, 0)} Items
                    </span>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                            <i className="ri-shopping-cart-line text-5xl opacity-20"></i>
                            <p className="text-sm">Cart is empty</p>
                            <button onClick={() => setIsMobileCartOpen(false)} className="lg:hidden text-gray-700 font-medium hover:underline">
                                Start Adding Products
                            </button>
                        </div>
                    ) : (
                        cart.map(item => (
                            <div key={item.cartKey} className="flex gap-3 p-3 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors">
                                <div className="w-16 h-16 bg-white rounded-md overflow-hidden flex-shrink-0 border border-gray-200">
                                    <img src={item.image} className="w-full h-full object-cover" alt="" />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 line-clamp-1">{item.name}</p>
                                            {item.variantName && <p className="text-xs text-gray-500 line-clamp-1">{item.variantName}</p>}
                                        </div>
                                        <button onClick={() => removeFromCart(item.cartKey)} className="text-gray-400 hover:text-red-500">
                                            <i className="ri-delete-bin-line"></i>
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex items-center space-x-2 bg-white rounded border border-gray-200 px-1 py-0.5">
                                            <button onClick={() => updateQuantity(item.cartKey, -1)} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded">
                                                <i className="ri-subtract-line text-xs"></i>
                                            </button>
                                            <span className="text-sm font-semibold w-6 text-center">{item.cartQuantity}</span>
                                            <button onClick={() => updateQuantity(item.cartKey, 1)} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded">
                                                <i className="ri-add-line text-xs"></i>
                                            </button>
                                        </div>
                                        <p className="text-sm font-bold text-gray-900">{formatCedis((toPesewas(item.price) * item.cartQuantity) / 100)}</p>
                                    </div>
                                    {!item.canOversell && item.cartQuantity > item.stock && (
                                        <p className="text-xs text-amber-700 mt-1 flex items-center">
                                            <i className="ri-error-warning-line mr-1"></i>
                                            Only {Math.max(item.stock, 0)} in stock
                                        </p>
                                    )}
                                    {item.isPreorder && (
                                        <p className="text-xs text-gray-500 mt-1 flex items-center">
                                            <i className="ri-time-line mr-1"></i>
                                            Preorder
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Cart Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-4 shrink-0 safe-area-bottom">
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between text-gray-600">
                            <span>Subtotal</span>
                            <span>{formatCedis(cartTotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>Tax (0%)</span>
                            <span>GH₵0.00</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t border-gray-200 mt-2">
                            <span>Total</span>
                            <span>{formatCedis(grandTotal)}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={emptyCart}
                            disabled={cart.length === 0}
                            className="px-4 py-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => { setShowCheckoutModal(true); setCheckoutError(null); }}
                            disabled={cart.length === 0}
                            className="px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-primary font-bold text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Charge {formatCedis(grandTotal)}
                        </button>
                    </div>
                </div>
            </div>

            {/* Checkout Modal */}
            {showCheckoutModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {completedOrder ? (
                            // SUCCESS STATE
                            <div className="p-8 text-center flex flex-col items-center justify-center space-y-6 overflow-y-auto">
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${completedOrder.paymentPending ? 'bg-amber-100' : 'bg-gray-100'}`}>
                                    <i className={`text-5xl ${completedOrder.paymentPending ? 'ri-time-line text-amber-600' : 'ri-checkbox-circle-fill text-gray-700'}`}></i>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">
                                        {completedOrder.paymentPending ? 'Payment Link Generated!' : 'Payment Successful!'}
                                    </h2>
                                    <p className="text-gray-500 mt-1">Order #{completedOrder.orderNumber}</p>

                                    {!completedOrder.paymentPending && completedOrder.changeDue > 0 && (
                                        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                            <p className="text-sm text-gray-900">Change Due</p>
                                            <p className="text-2xl font-bold text-gray-800">{formatCedis(completedOrder.changeDue)}</p>
                                        </div>
                                    )}

                                    {completedOrder.paymentPending && completedOrder.paymentUrl && (
                                        <div className="mt-4 space-y-3">
                                            <p className="text-sm text-gray-600">
                                                Customer can pay using this link:
                                            </p>
                                            <a
                                                href={completedOrder.paymentUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center px-6 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors"
                                            >
                                                <i className="ri-external-link-line mr-2"></i>
                                                Open Payment Page
                                            </a>
                                            <div className="mt-2">
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(completedOrder.paymentUrl);
                                                        alert('Payment link copied!');
                                                    }}
                                                    className="text-sm text-gray-900 hover:text-gray-800 font-medium underline"
                                                >
                                                    <i className="ri-file-copy-line mr-1"></i>
                                                    Copy Link
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {(completedOrder.items || []).length > 0 && (
                                    <div className="w-full text-left border border-gray-200 rounded-xl divide-y divide-gray-100">
                                        {(completedOrder.items as ReceiptItem[]).map((it, idx) => (
                                            <div key={idx} className="flex justify-between gap-3 px-4 py-2 text-sm">
                                                <div className="min-w-0">
                                                    <p className="font-medium text-gray-900 truncate">{it.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {it.variantName ? `${it.variantName} · ` : ''}{it.quantity} × {formatCedis(it.unitPrice)}
                                                    </p>
                                                </div>
                                                <span className="font-semibold text-gray-900 shrink-0">{formatCedis(it.lineTotal)}</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between px-4 py-2 text-sm font-bold text-gray-900">
                                            <span>Total</span>
                                            <span>{formatCedis(completedOrder.total)}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4 w-full mt-4">
                                    <button onClick={() => window.print()} disabled={completedOrder.paymentPending} title={completedOrder.paymentPending ? 'Print once the customer has paid' : undefined} className="disabled:opacity-50 disabled:cursor-not-allowed py-3 px-4 border border-gray-300 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                                        <i className="ri-printer-line mr-2"></i>
                                        Print Receipt
                                    </button>
                                    <button onClick={resetCheckout} className="py-3 px-4 bg-gray-700 text-white rounded-xl font-semibold hover:bg-primary transition-colors">
                                        New Order
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // CHECKOUT FORM
                            <>
                                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                                    <h3 className="text-xl font-bold text-gray-900">Finalize Payment</h3>
                                    <button onClick={() => setShowCheckoutModal(false)} className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500">
                                        <i className="ri-close-line text-xl"></i>
                                    </button>
                                </div>

                                <div className="p-6 space-y-6 overflow-y-auto">
                                    {/* Error Display */}
                                    {checkoutError && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2">
                                            <i className="ri-error-warning-line text-red-500 mt-0.5"></i>
                                            <p className="text-sm text-red-700">{checkoutError}</p>
                                        </div>
                                    )}

                                    {overStockItems.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                                            <p className="font-semibold flex items-center"><i className="ri-error-warning-line mr-1"></i>More than the stock on record</p>
                                            <ul className="mt-1 list-disc pl-5">
                                                {overStockItems.map(i => (
                                                    <li key={i.cartKey}>{i.name}{i.variantName ? ` (${i.variantName})` : ''}: {i.cartQuantity} in cart, {Math.max(i.stock, 0)} in stock</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Total Display */}
                                    <div className="text-center py-4 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-sm text-gray-800 uppercase tracking-wide font-semibold">Amount to Pay</p>
                                        <p className="text-4xl font-extrabold text-gray-900 mt-1">{formatCedis(grandTotal)}</p>
                                    </div>

                                    {/* Customer Select */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Customer</label>

                                        {/* Customer search input */}
                                        <div className="relative mb-2">
                                            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                            <input
                                                type="text"
                                                placeholder="Search customers by name, email, or phone..."
                                                value={customerSearch}
                                                onChange={(e) => setCustomerSearch(e.target.value)}
                                                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 outline-none text-sm"
                                            />
                                            {customerSearching && (
                                                <i className="ri-loader-4-line animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                            )}
                                        </div>

                                        <select
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 outline-none mb-2"
                                            onChange={(e) => {
                                                setSelectedCustomer(filteredCustomers.find(c => c.id === e.target.value) || null);
                                            }}
                                            value={selectedCustomer?.id || ''}
                                        >
                                            <option value="">Walk-in Customer / New Guest</option>
                                            {filteredCustomers.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.full_name || 'No Name'} — {c.phone || c.email}
                                                </option>
                                            ))}
                                        </select>

                                        {selectedCustomer && (
                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 flex items-center justify-between">
                                                <div>
                                                    <p className="font-semibold text-gray-900 text-sm">{selectedCustomer.full_name}</p>
                                                    <p className="text-xs text-gray-600">{selectedCustomer.email} {selectedCustomer.phone && `| ${selectedCustomer.phone}`}</p>
                                                </div>
                                                <button
                                                    onClick={() => setSelectedCustomer(null)}
                                                    className="text-gray-400 hover:text-red-500 text-sm"
                                                >
                                                    <i className="ri-close-line"></i>
                                                </button>
                                            </div>
                                        )}

                                        {!selectedCustomer && (
                                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2 space-y-3">
                                                <h4 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-2">
                                                    New Customer Details
                                                    <span className="text-xs font-normal text-gray-500 ml-2">(will be saved to customer list)</span>
                                                </h4>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input
                                                        type="text"
                                                        placeholder="First Name *"
                                                        value={guestDetails.firstName}
                                                        onChange={e => setGuestDetails({ ...guestDetails, firstName: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-600 text-sm"
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Last Name"
                                                        value={guestDetails.lastName}
                                                        onChange={e => setGuestDetails({ ...guestDetails, lastName: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-600 text-sm"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input
                                                        type="email"
                                                        placeholder="Email"
                                                        value={guestDetails.email}
                                                        onChange={e => setGuestDetails({ ...guestDetails, email: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-600 text-sm"
                                                    />
                                                    <input
                                                        type="tel"
                                                        placeholder={paymentMethod === 'momo' ? 'Phone (Required) *' : 'Phone'}
                                                        value={guestDetails.phone}
                                                        onChange={e => setGuestDetails({ ...guestDetails, phone: e.target.value })}
                                                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-600 text-sm ${paymentMethod === 'momo' && !guestDetails.phone ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
                                                            }`}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delivery Method */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Delivery Method</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setDeliveryMethod('pickup')}
                                                className={`p-3 rounded-lg border transition-all flex items-center space-x-3 ${deliveryMethod === 'pickup'
                                                    ? 'border-gray-700 bg-gray-50 ring-1 ring-gray-700'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <i className={`ri-store-2-line text-xl ${deliveryMethod === 'pickup' ? 'text-gray-900' : 'text-gray-400'}`}></i>
                                                <div className="text-left">
                                                    <p className={`text-sm font-semibold ${deliveryMethod === 'pickup' ? 'text-gray-800' : 'text-gray-700'}`}>Store Pickup</p>
                                                    <p className="text-xs text-gray-500">Customer picks up</p>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => setDeliveryMethod('doorstep')}
                                                className={`p-3 rounded-lg border transition-all flex items-center space-x-3 ${deliveryMethod === 'doorstep'
                                                    ? 'border-gray-700 bg-gray-50 ring-1 ring-gray-700'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <i className={`ri-truck-line text-xl ${deliveryMethod === 'doorstep' ? 'text-gray-900' : 'text-gray-400'}`}></i>
                                                <div className="text-left">
                                                    <p className={`text-sm font-semibold ${deliveryMethod === 'doorstep' ? 'text-gray-800' : 'text-gray-700'}`}>Doorstep Delivery</p>
                                                    <p className="text-xs text-gray-500">Deliver to address</p>
                                                </div>
                                            </button>
                                        </div>

                                        {/* Delivery Address (shown for doorstep delivery) */}
                                        {deliveryMethod === 'doorstep' && (
                                            <div className="mt-3 bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-3">
                                                <h4 className="text-sm font-bold text-gray-900 flex items-center">
                                                    <i className="ri-map-pin-line mr-2 text-blue-600"></i>
                                                    Delivery Address
                                                </h4>
                                                <input
                                                    type="text"
                                                    placeholder="Street Address / Location *"
                                                    value={guestDetails.address}
                                                    onChange={e => setGuestDetails({ ...guestDetails, address: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                />
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input
                                                        type="text"
                                                        placeholder="City / Town *"
                                                        value={guestDetails.city}
                                                        onChange={e => setGuestDetails({ ...guestDetails, city: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                    />
                                                    <select
                                                        value={guestDetails.region}
                                                        onChange={e => setGuestDetails({ ...guestDetails, region: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                    >
                                                        <option value="">Select Region *</option>
                                                        {regions.map(r => (
                                                            <option key={r} value={r}>{r}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Payment Method */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { key: 'cash', label: 'Cash', icon: 'ri-money-cny-circle-line' },
                                                { key: 'card', label: 'Card', icon: 'ri-bank-card-line' },
                                                { key: 'momo', label: 'MoMo', icon: 'ri-smartphone-line' }
                                            ].map(method => (
                                                <button
                                                    key={method.key}
                                                    onClick={() => setPaymentMethod(method.key as 'cash' | 'card' | 'momo')}
                                                    className={`py-3 rounded-lg font-medium border transition-all flex flex-col items-center space-y-1 ${paymentMethod === method.key
                                                        ? 'border-gray-700 bg-gray-50 text-gray-800 ring-1 ring-gray-700'
                                                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                                        }`}
                                                >
                                                    <i className={`${method.icon} text-xl`}></i>
                                                    <span className="text-sm">{method.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Cash Tendered */}
                                    {paymentMethod === 'cash' && (
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Amount Tendered</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">GH₵</span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    step="0.01"
                                                    min="0"
                                                    value={amountTendered}
                                                    onChange={(e) => setAmountTendered(e.target.value)}
                                                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 outline-none font-bold text-lg"
                                                    placeholder="0.00"
                                                    autoFocus
                                                />
                                            </div>
                                            {changeDue > 0 && (
                                                <p className="text-right text-gray-700 font-bold mt-2">Change: {formatCedis(changeDue)}</p>
                                            )}
                                            {changeDue < 0 && amountTendered && (
                                                <p className="text-right text-red-500 font-medium mt-2">Insufficient amount</p>
                                            )}
                                            {/* Quick amount buttons */}
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {[grandTotalP, Math.ceil(grandTotalP / 1000) * 1000, Math.ceil(grandTotalP / 5000) * 5000, Math.ceil(grandTotalP / 10000) * 10000].filter((v, i, a) => a.indexOf(v) === i).map(amountP => (
                                                    <button
                                                        key={amountP}
                                                        onClick={() => setAmountTendered((amountP / 100).toFixed(2))}
                                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                                                    >
                                                        {formatCedis(amountP / 100)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* MoMo info */}
                                    {paymentMethod === 'momo' && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                            <div className="flex items-start space-x-2">
                                                <i className="ri-information-line text-amber-600 mt-0.5"></i>
                                                <div className="text-sm text-amber-800">
                                                    <p className="font-semibold">Mobile Money Payment</p>
                                                    <p className="mt-1">A Moolre payment link will be generated. The customer can pay via their phone, or you can open the link on your device.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Card info */}
                                    {paymentMethod === 'card' && (
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <div className="flex items-start space-x-2">
                                                <i className="ri-bank-card-line text-blue-600 mt-0.5"></i>
                                                <div className="text-sm text-blue-800">
                                                    <p className="font-semibold">Card Payment</p>
                                                    <p className="mt-1">Process the card payment on your POS terminal, then tap &quot;Complete Payment&quot; to confirm.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 border-t border-gray-100 bg-gray-50 shrink-0">
                                    <button
                                        onClick={handleCheckout}
                                        disabled={processing}
                                        className="w-full py-4 bg-primary text-white rounded-xl font-bold text-lg shadow-lg hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
                                    >
                                        {processing ? (
                                            <>
                                                <i className="ri-loader-4-line animate-spin"></i>
                                                <span>Processing...</span>
                                            </>
                                        ) : paymentMethod === 'momo' ? (
                                            <>
                                                <i className="ri-smartphone-line"></i>
                                                <span>Generate Payment Link</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="ri-secure-payment-line"></i>
                                                <span>Complete Payment</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Variant Picker Modal */}
            {variantPickerProduct && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setVariantPickerProduct(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Choose an option</h3>
                                <p className="text-sm text-gray-500">{variantPickerProduct.name}</p>
                            </div>
                            <button
                                onClick={() => setVariantPickerProduct(null)}
                                className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500"
                                aria-label="Close"
                            >
                                <i className="ri-close-line text-xl"></i>
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-2">
                            {variantPickerProduct.variants.map((variant) => {
                                const stock = variant.quantity || 0;
                                const outOfStock = stock <= 0 && !variantPickerProduct.canOversell;
                                return (
                                    <button
                                        key={variant.id}
                                        onClick={() => {
                                            addToCart(variantPickerProduct, variant);
                                            setVariantPickerProduct(null);
                                        }}
                                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 text-left transition-colors hover:border-gray-400 hover:bg-gray-50"
                                    >
                                        <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                                            <img src={variant.image_url || variantPickerProduct.image} alt="" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-gray-900">{getVariantLabel(variant)}</p>
                                            <p className={`text-xs ${outOfStock ? 'text-amber-700' : 'text-gray-500'}`}>
                                                {variant.sku ? `SKU: ${variant.sku} · ` : ''}
                                                {variantPickerProduct.isPreorder ? 'Preorder' : outOfStock ? 'Out of stock' : `Stock: ${stock}`}
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900 shrink-0">{formatCedis(variant.price)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Print-only receipt: window.print() prints this and nothing else. */}
            {completedOrder && !completedOrder.paymentPending && typeof document !== 'undefined' && createPortal(
                <div id="pos-print-receipt" className="hidden print:block">
                    <style>{`
                        @media print {
                            @page { margin: 6mm; }
                            body > *:not(#pos-print-receipt) { display: none !important; }
                            #pos-print-receipt { display: block !important; color: #000; font-family: ui-monospace, Menlo, monospace; font-size: 12px; width: 72mm; }
                            #pos-print-receipt table { width: 100%; border-collapse: collapse; }
                            #pos-print-receipt td { padding: 2px 0; vertical-align: top; }
                        }
                    `}</style>
                    <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{STORE_NAME}</p>
                    <p style={{ textAlign: 'center' }}>Receipt #{completedOrder.orderNumber}</p>
                    <p style={{ textAlign: 'center' }}>
                        {new Date(completedOrder.createdAt || Date.now()).toLocaleString('en-GH', { timeZone: 'Africa/Accra' })}
                    </p>
                    {completedOrder.customerName && <p>Customer: {completedOrder.customerName}</p>}
                    <hr />
                    <table>
                        <tbody>
                            {(completedOrder.items as ReceiptItem[] || []).map((it, idx) => (
                                <tr key={idx}>
                                    <td>
                                        {it.name}{it.variantName ? ` (${it.variantName})` : ''}<br />
                                        {it.quantity} x {formatCedis(it.unitPrice)}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>{formatCedis(it.lineTotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <hr />
                    <table>
                        <tbody>
                            <tr><td><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{formatCedis(completedOrder.total)}</strong></td></tr>
                            <tr><td>Paid by</td><td style={{ textAlign: 'right' }}>{completedOrder.paymentMethod === 'card' ? 'Card' : 'Cash'}</td></tr>
                            {completedOrder.paymentMethod === 'cash' && completedOrder.amountTendered != null && (
                                <tr><td>Tendered</td><td style={{ textAlign: 'right' }}>{formatCedis(completedOrder.amountTendered)}</td></tr>
                            )}
                            {completedOrder.paymentMethod === 'cash' && (
                                <tr><td>Change</td><td style={{ textAlign: 'right' }}>{formatCedis(completedOrder.changeDue || 0)}</td></tr>
                            )}
                        </tbody>
                    </table>
                    <p style={{ textAlign: 'center', marginTop: 8 }}>Thank you for shopping with us.</p>
                </div>,
                document.body
            )}
        </div>
    );
}

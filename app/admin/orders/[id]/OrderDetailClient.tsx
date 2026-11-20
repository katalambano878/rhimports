'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import FraudDetectionAlert from '@/components/FraudDetectionAlert';

interface OrderDetailClientProps {
  orderId: string;
}

type RiskLevel = 'low' | 'medium' | 'high';

interface FraudAnalysis {
  riskLevel: RiskLevel;
  reasons: string[];
}

export default function OrderDetailClient({ orderId }: OrderDetailClientProps) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [storeName, setStoreName] = useState('RNH Imports');
  const [storeEmail, setStoreEmail] = useState('');
  const [statusHistory, setStatusHistory] = useState<{ id: string; status: string; notes: string | null; created_at: string }[]>([]);
  const [markingPaid, setMarkingPaid] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  // Inject print styles
  useEffect(() => {
    const styleId = 'order-print-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = '@media print { body * { visibility: hidden; } .print-section, .print-section * { visibility: visible; } .print-section { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; } .no-print { display: none !important; } }';
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  useEffect(() => {
    fetchOrderDetails();
    // Fetch store name from settings
    supabase.from('store_settings').select('value').eq('key', 'site_name').single()
      .then(({ data }) => { if (data?.value) setStoreName(typeof data.value === 'string' ? data.value : String(data.value)); });
    supabase.from('store_settings').select('value').eq('key', 'contact_email').single()
      .then(({ data }) => { if (data?.value) setStoreEmail(typeof data.value === 'string' ? data.value : String(data.value)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when orderId changes
  }, [orderId]);

  // The orders list links here with ?print=true: open the print dialog once the slip has data.
  const [autoPrinted, setAutoPrinted] = useState(false);
  useEffect(() => {
    if (!order || autoPrinted || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') !== 'true') return;
    setAutoPrinted(true);
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [order, autoPrinted]);

  const fetchStatusHistory = async (id: string) => {
    const { data, error: histErr } = await supabase
      .from('order_status_history')
      .select('id, status, notes, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true });
    if (histErr) {
      console.error('Error fetching status history:', histErr);
      return;
    }
    setStatusHistory(data || []);
  };

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      // Try to fetch by ID or order_number
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            product_id,
            product_name,
            variant_name,
            sku,
            quantity,
            unit_price,
            total_price,
            metadata,
            products (
              product_images (url)
            )
          )
        `)
        .eq('id', orderId);

      let { data, error } = await query.single();

      if (error && error.code === 'PGRST116') {
        // Not found by ID, try order_number
        const { data: dataByNum, error: errorByNum } = await supabase
          .from('orders')
          .select(`
            *,
            order_items (
              id,
              product_id,
              product_name,
              variant_name,
              sku,
              quantity,
              unit_price,
              total_price,
              metadata,
              products (
                product_images (url)
              )
            )
          `)
          .eq('order_number', orderId)
          .single();

        if (dataByNum) {
          data = dataByNum;
          error = null;
        } else {
          error = errorByNum;
        }
      }

      if (error) throw error;
      setOrder(data);
      setTrackingNumber(data.metadata?.tracking_number || '');
      setAdminNotes(data.notes || '');
      fetchStatusHistory(data.id);

    } catch (err: any) {
      console.error('Error fetching order:', err);
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  /** Email + SMS the customer about a status (or tracking) change. Returns a warning when it failed. */
  const sendStatusNotification = async (status: string, tracking: string): Promise<string | null> => {
    try {
      const addr = order.shipping_address || {};
      const name = (addr.firstName && addr.lastName)
        ? `${addr.firstName.trim()} ${addr.lastName.trim()}`
        : addr.full_name || addr.firstName || order.email?.split('@')[0] || 'Customer';
      const authToken = await getAuthToken();
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        body: JSON.stringify({
          type: 'order_status',
          payload: {
            email: order.email,
            name,
            orderId: order.id,
            orderNumber: order.order_number || orderId,
            status,
            trackingNumber: tracking,
            phone: addr.phone || order.phone
          }
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return body?.error || `Notification failed (${res.status})`;
      }
      return null;
    } catch (err: any) {
      console.error('Notification error:', err);
      return `Notification could not be sent: ${err?.message || 'network error'}`;
    }
  };

  /** Re-read the order's metadata now and merge only our keys, so a payment callback's keys survive. */
  const mergeIntoCurrentMetadata = async (patch: Record<string, unknown>) => {
    const { data: fresh, error: readErr } = await supabase
      .from('orders')
      .select('metadata')
      .eq('id', order.id)
      .single();
    if (readErr) throw readErr;
    const current = fresh?.metadata && typeof fresh.metadata === 'object' && !Array.isArray(fresh.metadata)
      ? fresh.metadata
      : {};
    return { ...current, ...patch };
  };

  /**
   * Cancel or refund through the server so payment status and stock are
   * handled in one transaction. Asks for confirmation first.
   */
  const handleCancelOrRefund = async (action: 'cancel' | 'refund') => {
    if (!order) return;
    const wasPaid = order.payment_status === 'paid' || order.payment_status === 'partially_refunded';
    const stockTaken = !!order.metadata?.stock_reduced && !order.metadata?.stock_restored;
    const lines: string[] = [
      action === 'refund'
        ? `Mark order ${order.order_number} as REFUNDED?`
        : `Cancel order ${order.order_number}?`,
      '',
    ];
    if (action === 'refund') {
      lines.push(wasPaid
        ? '• Payment status will change to "refunded". No money is sent back automatically: refund the customer through Mobile Money, your payment provider or in cash yourself.'
        : '• The order was not paid, so payment status stays as it is.');
    } else if (wasPaid) {
      lines.push('• The order is paid. Cancelling does NOT mark the payment refunded. If you are giving the money back, choose "Refunded" instead.');
    }
    lines.push(stockTaken
      ? '• The items will be put back into stock.'
      : '• Stock is not changed (it was never taken for this order, or was already returned).');
    lines.push('• The customer will be notified of the new status.');
    if (!confirm(lines.join('\n'))) return;

    try {
      setStatusUpdating(true);
      const authToken = await getAuthToken();
      const res = await fetch('/api/admin/orders/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { Authorization: `Bearer ${authToken}` }),
        },
        body: JSON.stringify({ orderId: order.id, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);

      const newStatus = action === 'refund' ? 'refunded' : 'cancelled';
      const warning = body?.alreadyDone ? null : await sendStatusNotification(newStatus, order.metadata?.tracking_number || '');
      await fetchOrderDetails();
      alert(
        (body?.alreadyDone ? 'Order was already in that state.' : `Order ${newStatus}.`) +
          (body?.stockRestored ? ' Stock was returned.' : '') +
          (warning ? `\n\nThe customer was not notified: ${warning}` : '')
      );
      setShowStatusMenu(false);
    } catch (err: any) {
      console.error('Error cancelling/refunding order:', err);
      alert('Failed to update order: ' + (err?.message || 'Unknown error'));
    } finally {
      setStatusUpdating(false);
    }
  };

  /** Change the order status after the staff member confirms; records an order_status_history row. */
  const handleChangeStatus = async (newStatus: string) => {
    if (!order) return;
    setShowStatusMenu(false);
    const previousStatus = order.status || 'pending';
    if (newStatus === previousStatus) return;
    if (newStatus === 'cancelled' || newStatus === 'refunded') {
      await handleCancelOrRefund(newStatus === 'refunded' ? 'refund' : 'cancel');
      return;
    }
    if (previousStatus === 'cancelled' || previousStatus === 'refunded') {
      alert(`This order is ${previousStatus}. It cannot be reopened here, because its stock and payment were already settled. Create a new order instead.`);
      return;
    }
    const unpaid = order.payment_status !== 'paid';
    const msg =
      `Change order ${order.order_number} from "${statusLabel(previousStatus)}" to "${statusLabel(newStatus)}"?\n\n` +
      (unpaid ? `Warning: this order is NOT paid (payment: ${order.payment_status}). If the money has been received, use "Mark as Paid" first.\n\n` : '') +
      'The customer will be notified by email/SMS.';
    if (!confirm(msg)) return;

    try {
      setStatusUpdating(true);
      const { error: upErr } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (upErr) throw upErr;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: histErr } = await supabase.from('order_status_history').insert({
        order_id: order.id,
        status: newStatus,
        notes: `Changed from ${previousStatus}`,
        created_by: user?.id ?? null,
      });
      if (histErr) console.error('Status history insert failed:', histErr);

      setOrder({ ...order, status: newStatus });
      fetchStatusHistory(order.id);
      const warning = await sendStatusNotification(newStatus, order.metadata?.tracking_number || '');
      alert(
        `Order status changed to ${statusLabel(newStatus)}.` +
          (histErr ? '\n\nThe change was not written to the status history.' : '') +
          (warning ? `\n\nThe customer was not notified: ${warning}` : '')
      );
    } catch (err: any) {
      console.error('Error updating order status:', err);
      alert('Failed to update order status: ' + (err?.message || 'Unknown error'));
    } finally {
      setStatusUpdating(false);
    }
  };

  /** Save tracking number and admin notes without touching any other metadata key. */
  const handleSaveDetails = async () => {
    if (!order) return;
    try {
      setStatusUpdating(true);
      const previousTracking = order.metadata?.tracking_number || '';
      const trackingChanged = trackingNumber !== previousTracking;
      const update: Record<string, unknown> = { notes: adminNotes, updated_at: new Date().toISOString() };
      let nextMetadata = order.metadata;
      if (trackingChanged) {
        nextMetadata = await mergeIntoCurrentMetadata({ tracking_number: trackingNumber });
        update.metadata = nextMetadata;
      }
      const { error: upErr } = await supabase.from('orders').update(update).eq('id', order.id);
      if (upErr) throw upErr;

      setOrder({ ...order, notes: adminNotes, metadata: nextMetadata });

      let warning: string | null = null;
      if (trackingChanged && trackingNumber) {
        warning = await sendStatusNotification(order.status, trackingNumber);
      }
      alert(warning ? `Saved, but the customer was not notified.\n\n${warning}` : 'Saved');
    } catch (err: any) {
      console.error('Error updating order:', err);
      alert('Failed to save: ' + (err?.message || 'Unknown error'));
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!order) return;
    if (!confirm(
      `Mark order ${order.order_number} (GH₵ ${Number(order.total || 0).toFixed(2)}) as PAID?\n\n` +
      'Only do this after you have received the money. Stock is taken for the items and a pending order moves to Processing.'
    )) return;
    try {
      setMarkingPaid(true);
      const authToken = await getAuthToken();
      const res = await fetch('/api/admin/orders/mark-paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { Authorization: `Bearer ${authToken}` }),
        },
        body: JSON.stringify({ orderNumber: order.order_number }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      await fetchOrderDetails();
      alert(body?.order?.already_paid ? 'This order was already marked as paid.' : 'Order marked as paid.');
    } catch (err: any) {
      console.error('Error marking as paid:', err);
      alert('Failed to mark as paid: ' + (err?.message || 'Unknown error'));
    } finally {
      setMarkingPaid(false);
    }
  };

  const [resendingNotification, setResendingNotification] = useState(false);

  const handleResendNotification = async () => {
    if (!order) return;

    try {
      setResendingNotification(true);

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      const shippingAddress = order.shipping_address || {};
      const customerName = (shippingAddress.firstName && shippingAddress.lastName)
        ? `${shippingAddress.firstName.trim()} ${shippingAddress.lastName.trim()}`
        : shippingAddress.full_name || shippingAddress.firstName || order.email?.split('@')[0] || 'Customer';

      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        body: JSON.stringify({
          type: 'order_status',
          payload: {
            email: order.email,
            name: customerName,
            orderNumber: order.order_number || order.id,
            status: order.status,
            trackingNumber: order.metadata?.tracking_number || '',
            phone: order.phone || shippingAddress.phone
          }
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send notification');
      }

      alert('Notification sent successfully! (Email + SMS if phone available)');
    } catch (err: any) {
      console.error('Error resending notification:', err);
      alert(`Failed to resend notification: ${err.message || 'Unknown error'}`);
    } finally {
      setResendingNotification(false);
    }
  };

  const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
  function statusLabel(s: string) {
    if (s === 'shipped') return 'Packaged';
    return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ');
  }
  const statusColors: any = {
    'pending': 'bg-amber-100 text-amber-700 border-amber-200',
    'processing': 'bg-blue-100 text-blue-700 border-blue-200',
    'shipped': 'bg-purple-100 text-purple-700 border-purple-200',
    'delivered': 'bg-gray-100 text-gray-700 border-gray-200',
    'cancelled': 'bg-red-100 text-red-700 border-red-200',
    'refunded': 'bg-purple-100 text-purple-700 border-purple-200',
    'awaiting_payment': 'bg-gray-100 text-gray-700 border-gray-200'
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (error || !order) return <div className="p-8 text-center text-red-500">{error || 'Order not found'}</div>;

  const currentStatus = order.status || 'pending';
  const shippingAddress = order.shipping_address || {};
  const customerName = (shippingAddress.firstName && shippingAddress.lastName)
    ? `${shippingAddress.firstName.trim()} ${shippingAddress.lastName.trim()}`
    : shippingAddress.full_name || shippingAddress.firstName || order.email?.split('@')[0] || 'Customer';

  // Derive timeline from status (simplified logic as we don't have full history table joined here yet)
  const timeline = [
    { status: 'Order Placed', date: new Date(order.created_at).toLocaleString(), completed: true },
    { status: 'Payment', date: order.payment_status, completed: order.payment_status === 'paid' },
    { status: 'Processing', date: '', completed: ['processing', 'shipped', 'delivered'].includes(order.status) },
    { status: 'Packaged', date: '', completed: ['shipped', 'delivered'].includes(order.status) },
    { status: 'Delivered', date: '', completed: order.status === 'delivered' }
  ];

  // Mock fraud analysis for now (or implement real logic later)
  const fraudAnalysis: FraudAnalysis = {
    riskLevel: 'low',
    reasons: []
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print styles injected via useEffect */}

      {/* Printable Order Slip */}
      <div className="print-section hidden print:block bg-white p-8">
        <div className="border-2 border-gray-800 p-6">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold">{storeName}</h1>
              <p className="text-sm text-gray-600">Order Packing Slip</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">{order?.order_number}</p>
              <p className="text-sm">{order ? new Date(order.created_at).toLocaleDateString() : ''}</p>
            </div>
          </div>

          {/* Ship To */}
          <div className="mb-6">
            <h2 className="font-bold text-lg mb-2 bg-gray-200 px-2 py-1">SHIP TO:</h2>
            <div className="pl-2">
              <p className="font-bold text-lg">{customerName}</p>
              <p>{shippingAddress.phone || order?.phone}</p>
              <p>{shippingAddress.address || shippingAddress.address_line1}</p>
              <p>{shippingAddress.city}{(shippingAddress.region || shippingAddress.state) && `, ${shippingAddress.region || shippingAddress.state}`}</p>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h2 className="font-bold text-lg mb-2 bg-gray-200 px-2 py-1">ORDER ITEMS:</h2>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-400">
                  <th className="text-left py-2 px-2">Product</th>
                  <th className="text-left py-2 px-2">Variant</th>
                  <th className="text-center py-2 px-2">Qty</th>
                  <th className="text-right py-2 px-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {order?.order_items?.map((item: any) => (
                  <tr key={item.id} className="border-b border-gray-200">
                    <td className="py-2 px-2 font-medium">{item.product_name}</td>
                    <td className="py-2 px-2 text-sm">{item.variant_name || '-'}</td>
                    <td className="py-2 px-2 text-center font-bold">{item.quantity}</td>
                    <td className="py-2 px-2 text-right">GH₵ {item.unit_price?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Order Summary */}
          <div className="flex justify-between mb-6">
            <div>
              <p><span className="font-semibold">Shipping Method:</span> {order?.shipping_method || 'Standard'}</p>
              <p><span className="font-semibold">Payment:</span> {order?.payment_method} ({order?.payment_status})</p>
              {trackingNumber && <p><span className="font-semibold">Tracking #:</span> {trackingNumber}</p>}
            </div>
            <div className="text-right">
              <p>Subtotal: GH₵ {order?.subtotal?.toFixed(2)}</p>
              <p>Shipping: GH₵ {order?.shipping_total?.toFixed(2)}</p>
              <p className="font-bold text-lg border-t border-gray-400 pt-1 mt-1">Total: GH₵ {order?.total?.toFixed(2)}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t-2 border-gray-800 pt-4 text-center text-sm text-gray-600">
            <p>Thank you for shopping with {storeName}!</p>
            {storeEmail && <p>Questions? Contact us at {storeEmail}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 no-print">
        {/* Page Header with Print Button */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link href="/admin/orders" className="text-gray-600 hover:text-gray-900">
              <i className="ri-arrow-left-line text-2xl"></i>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{order?.order_number}</h1>
              <p className="text-sm text-gray-600">Order placed on {order ? new Date(order.created_at).toLocaleDateString() : ''}</p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 bg-primary hover:bg-primary text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <i className="ri-printer-line text-lg"></i>
            <span>Print Order</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {fraudAnalysis.riskLevel !== 'low' && (
              <FraudDetectionAlert
                riskLevel={fraudAnalysis.riskLevel}
                reasons={fraudAnalysis.reasons}
                orderId={orderId}
              />
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Order Items</h2>
                <span className="text-gray-600">{order.order_items?.length || 0} items</span>
              </div>

              <div className="space-y-4">
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="w-20 h-20 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center relative">
                      {item.products?.product_images?.[0]?.url ? (
                        <img
                          src={item.products.product_images[0].url}
                          alt={item.product_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <i className="ri-image-line text-2xl text-gray-300"></i>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{item.product_name}</h3>
                      <p className="text-sm text-gray-600 mb-1">{item.variant_name}</p>
                      <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 mb-1">GH₵ {item.unit_price?.toFixed(2)}</p>
                      <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span>GH₵ {order.subtotal?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Shipping</span>
                  <span>GH₵ {order.shipping_total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Tax</span>
                  <span>GH₵ {order.tax_total?.toFixed(2)}</span>
                </div>
                {order.discount_total > 0 && (
                  <div className="flex justify-between text-gray-700 font-semibold">
                    <span>Discount</span>
                    <span>-GH₵ {order.discount_total?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold text-gray-900 pt-3 border-t border-gray-200">
                  <span>Total</span>
                  <span>GH₵ {order.total?.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Order Timeline</h2>
              <div className="space-y-4">
                {timeline.map((event, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-full border-2 ${event.completed ? 'bg-gray-700 border-gray-700' : 'bg-white border-gray-300'
                      }`}>
                      {event.completed ? (
                        <i className="ri-check-line text-white text-xl"></i>
                      ) : (
                        <span className="w-3 h-3 bg-gray-300 rounded-full"></span>
                      )}
                    </div>
                    <div className="flex-1 pb-6 border-b border-gray-200 last:border-0">
                      <p className={`font-semibold ${event.completed ? 'text-gray-900' : 'text-gray-500'}`}>
                        {event.status}
                      </p>
                      {event.date && (
                        <p className="text-sm text-gray-600 mt-1">{event.date}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {statusHistory.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Status changes</h3>
                  <ul className="space-y-2">
                    {statusHistory.map((h) => (
                      <li key={h.id} className="flex justify-between gap-4 text-sm">
                        <span className="text-gray-900">
                          {statusLabel(h.status)}
                          {h.notes && <span className="text-gray-500"> — {h.notes}</span>}
                        </span>
                        <span className="text-gray-500 whitespace-nowrap">{new Date(h.created_at).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Order Status</h2>
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  className={`w-full px-4 py-3 rounded-lg border-2 font-semibold text-left flex items-center justify-between ${statusColors[currentStatus] || 'bg-gray-100'}`}
                >
                  <span>{statusLabel(currentStatus)}</span>
                  <i className="ri-arrow-down-s-line text-xl"></i>
                </button>
                {showStatusMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg overflow-hidden z-10">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        disabled={statusUpdating}
                        onClick={() => handleChangeStatus(status)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${status === currentStatus ? 'bg-gray-50 font-semibold' : ''
                          }`}
                      >
                        {statusLabel(status)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Tracking Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                />
              </div>

              <button
                onClick={handleSaveDetails}
                disabled={statusUpdating}
                className="w-full mt-4 bg-gray-700 hover:bg-primary text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {statusUpdating ? 'Saving...' : 'Save Tracking'}
              </button>
              <p className="text-xs text-gray-500 mt-2">Choosing a status above asks you to confirm before anything changes.</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Customer</h2>
              <div className="flex items-start space-x-3 mb-4">
                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 text-gray-700 rounded-full font-semibold uppercase">
                  {customerName.substring(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{customerName}</p>
                  <p className="text-sm text-gray-600">{order.email}</p>
                  <p className="text-sm text-gray-600">{shippingAddress.phone || order.phone}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Shipping Address</h2>
              <div className="text-gray-700 space-y-1">
                {/* Support both old field names (address_line1) and new (address) */}
                <p>{shippingAddress.address || shippingAddress.address_line1}</p>
                {(shippingAddress.address_line2) && <p>{shippingAddress.address_line2}</p>}
                <p>
                  {shippingAddress.city}
                  {(shippingAddress.region || shippingAddress.state) && `, ${shippingAddress.region || shippingAddress.state}`}
                </p>
                {shippingAddress.postal_code && <p>{shippingAddress.postal_code}</p>}
                {shippingAddress.country && <p className="font-semibold">{shippingAddress.country}</p>}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Info</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Method</span>
                  <span className="font-semibold text-gray-900 capitalize">{order.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold whitespace-nowrap capitalize">
                    {order.payment_status}
                  </span>
                </div>
                <div className="flex justify-between">
                  {/* Transaction ID might be in metadata depending on callback */}
                  <span className="text-gray-600">Transaction</span>
                  <span className="text-sm text-gray-900 font-mono truncate max-w-[150px]">
                    {order.metadata?.moolre_reference || order.payment_transaction_id || 'N/A'}
                  </span>
                </div>
              </div>

              {(order.payment_status === 'pending' || order.payment_status === 'failed') && order.status !== 'cancelled' && order.status !== 'refunded' && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleMarkAsPaid}
                    disabled={markingPaid}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50 flex items-center justify-center cursor-pointer"
                  >
                    {markingPaid ? (
                      <><i className="ri-loader-4-line animate-spin mr-2"></i>Processing...</>
                    ) : (
                      <><i className="ri-checkbox-circle-line mr-2"></i>Mark as Paid</>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Notifications</h2>
              <p className="text-sm text-gray-600 mb-4">
                Resend email and SMS notifications to the customer about the current order status.
              </p>
              <button
                onClick={handleResendNotification}
                disabled={resendingNotification}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50 flex items-center justify-center"
              >
                {resendingNotification ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="ri-notification-3-line mr-2"></i>
                    Resend Notifications
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Phone: {order.phone || shippingAddress.phone || 'Not provided'}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Admin Notes</h2>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add internal notes about this order..."
                rows={4}
                maxLength={500}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 resize-none"
              />
              <button
                onClick={handleSaveDetails}
                disabled={statusUpdating}
                className="w-full mt-3 bg-gray-700 hover:bg-primary text-white py-2 rounded-lg font-medium transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

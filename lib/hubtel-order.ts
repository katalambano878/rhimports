/**
 * Small Hubtel/order helpers shared by the payment routes.
 *
 * Pricing, ownership checks and "mark paid" live in
 * app/api/payment/_lib/order-charge.ts and app/api/payment/_lib/after-paid.ts.
 * Nothing here trusts totals written on the order row (discount_total,
 * shipping_total, tax_total, total): those used to be written by the browser.
 */
import type { HubtelTransactionStatus } from '@/lib/hubtel';
import { stripHubtelReferenceSuffix } from '@/lib/hubtel';

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * What the CUSTOMER paid according to Hubtel's status API. RMSC reports
 * TransactionAmount (→ amount, what the customer paid), Fee (→ charges) and
 * AmountAfterFees (→ amountAfterCharges, what the merchant settles). The
 * charge we asked Hubtel to collect is compared with the customer-paid amount,
 * not the after-fees settlement (lower whenever the merchant bears the fee).
 */
export function hubtelCustomerPaidAmount(status: HubtelTransactionStatus | null | undefined): number | null {
  if (!status) return null;
  if (typeof status.amount === 'number' && Number.isFinite(status.amount)) return roundMoney(status.amount);
  if (typeof status.amountAfterCharges === 'number' && Number.isFinite(status.amountAfterCharges)) {
    const fee = typeof status.charges === 'number' && Number.isFinite(status.charges) ? status.charges : 0;
    return roundMoney(status.amountAfterCharges + fee);
  }
  return null;
}

/**
 * True when a Hubtel clientReference belongs to this order: the reference
 * with its `-r<timestamp>` retry suffix removed equals the order number.
 * Over-long order numbers are truncated to 32 chars by makeHubtelClientReference.
 */
export function hubtelReferenceMatchesOrder(
  clientReference: string | null | undefined,
  orderNumber: string | null | undefined,
): boolean {
  if (!clientReference || !orderNumber) return false;
  const ref = String(clientReference).trim();
  const base = stripHubtelReferenceSuffix(ref);
  if (base === orderNumber) return true;
  // makeHubtelClientReference keeps at most 32 - suffix chars of the order number.
  return base.length >= 8 && orderNumber.length > base.length && orderNumber.startsWith(base) && ref.length === 32;
}

export function getPayeeName(order: Record<string, any>): string {
  const sa = order.shipping_address || {};
  if (sa.full_name) return String(sa.full_name).slice(0, 100);
  const fromShipping = [sa.firstName, sa.lastName].filter(Boolean).join(' ').trim();
  if (fromShipping) return fromShipping.slice(0, 100);
  const fromMeta = [order.metadata?.first_name, order.metadata?.last_name].filter(Boolean).join(' ').trim();
  return (fromMeta || 'Customer').slice(0, 100);
}

export function isValidOrderNumber(orderNumber: unknown): orderNumber is string {
  return typeof orderNumber === 'string' && /^ORD-\d+-\d+$/.test(orderNumber);
}

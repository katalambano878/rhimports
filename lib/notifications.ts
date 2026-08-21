import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { DEFAULT_CONTACT_PHONE } from '@/lib/contact';

// Server-side client that bypasses RLS for reads we make while building
// notifications (e.g. order items). Falls back to the anon client if the
// service role key is unavailable (it is never exposed to the browser).
const supabaseAdmin =
    process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
        ? createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL,
              process.env.SUPABASE_SERVICE_ROLE_KEY,
              { auth: { autoRefreshToken: false, persistSession: false } }
          )
        : supabase;

const resend = new Resend(process.env.RESEND_API_KEY || 'missing_api_key');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const STORE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'RNH Imports';
const EMAIL_FROM = process.env.EMAIL_FROM || `${STORE_NAME} <noreply@example.com>`;
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'RNHImports';
const BRAND = {
    name: STORE_NAME,
    color: '#1B2A6B',
    colorLight: '#EEF0FB',
    colorDark: '#0F1A47',
    url: (process.env.NEXT_PUBLIC_APP_URL || 'https://rnhimports.com').replace(/\/+$/, ''),
    phone: process.env.STORE_PHONE || DEFAULT_CONTACT_PHONE,
};

// Reusable branded email layout
export function emailLayout(body: string, preheader?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${BRAND.name}</title>
${preheader ? `<span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,${BRAND.color},${BRAND.colorDark});padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${BRAND.name}</h1>
<p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Trusted Importation &amp; Logistics · Ghana</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:40px 40px 32px;">
${body}
</td></tr>

<!-- Footer -->
<tr><td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="text-align:center;">
<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Need help? Contact us at <a href="tel:${BRAND.phone}" style="color:${BRAND.color};text-decoration:none;">${BRAND.phone}</a></p>
<p style="margin:0 0 12px;color:#6b7280;font-size:13px;"><a href="${BRAND.url}" style="color:${BRAND.color};text-decoration:none;">Visit our store</a> &nbsp;·&nbsp; <a href="${BRAND.url}/account?tab=orders" style="color:${BRAND.color};text-decoration:none;">View orders</a></p>
<p style="margin:0;color:#9ca3af;font-size:11px;">&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</p>
</td></tr>
</table>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

// Reusable styled button
function emailButton(text: string, href: string, color?: string): string {
    const bg = color || BRAND.color;
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr>
<td style="background-color:${bg};border-radius:8px;"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">${text}</a></td>
</tr></table>`;
}

// Reusable info row
function emailInfoRow(label: string, value: string): string {
    return `<tr>
<td style="padding:10px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;width:40%;">${label}</td>
<td style="padding:10px 16px;color:#111827;font-size:14px;font-weight:600;border-bottom:1px solid #f3f4f6;">${value}</td>
</tr>`;
}

/** Parse shipping_address if the client/API ever returns it as a JSON string. */
function shippingAddressObj(order: { shipping_address?: unknown }): Record<string, any> | null {
    const sa = order.shipping_address;
    if (!sa) return null;
    if (typeof sa === 'object' && sa !== null) return sa as Record<string, any>;
    if (typeof sa === 'string') {
        try {
            const parsed = JSON.parse(sa);
            return typeof parsed === 'object' && parsed !== null ? parsed : null;
        } catch {
            return null;
        }
    }
    return null;
}

/** Map an internal shipping_method code to a customer-friendly label. */
function deliveryMethodLabel(method?: string | null): string {
    if (!method) return 'Not specified';
    const key = String(method).toLowerCase().trim();
    const MAP: Record<string, string> = {
        doorstep: 'Doorstep Delivery',
        accra: 'Local Delivery (Accra)',
        'outside-accra': 'Regional Delivery (Outside Accra)',
        pickup: 'Store Pickup',
        'store-pickup': 'Store Pickup',
    };
    if (MAP[key]) return MAP[key];
    // Fallback: "some-method" → "Some Method"
    return key.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Escape a string for safe HTML interpolation. */
export function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Compact single-line plain-text summary of where an order should go.
 * Suitable for SMS or short admin previews.
 */
function deliveryAddressLine(order: any): string {
    const sa = shippingAddressObj(order) || {};
    const parts = [
        sa.address || sa.street || sa.address_line1,
        sa.city || sa.town,
        sa.region || sa.state,
    ].filter((p: any) => typeof p === 'string' && p.trim());
    return parts.join(', ').trim();
}

/** Rich HTML block summarizing the delivery destination for both customer & admin emails. */
function emailDeliveryDetails(order: any): string {
    const sa = shippingAddressObj(order) || {};
    const recipientName =
        (typeof sa.full_name === 'string' && sa.full_name.trim()) ? sa.full_name.trim() :
        [sa.firstName, sa.lastName].filter((p: any) => typeof p === 'string' && p.trim()).join(' ').trim() ||
        [order.metadata?.first_name, order.metadata?.last_name].filter((p: any) => typeof p === 'string' && p.trim()).join(' ').trim() ||
        'Customer';
    const street  = (sa.address || sa.street || sa.address_line1 || '').toString().trim();
    const city    = (sa.city || sa.town || '').toString().trim();
    const region  = (sa.region || sa.state || '').toString().trim();
    const country = (sa.country || 'Ghana').toString().trim();
    const phone   = resolveOrderPhone(order);
    const method  = deliveryMethodLabel(order.shipping_method);
    const shippingFee = Number(order.shipping_total ?? 0);

    const rows: string[] = [];
    rows.push(emailInfoRow('Method', escapeHtml(method)));
    rows.push(emailInfoRow('Recipient', escapeHtml(recipientName)));
    if (phone)   rows.push(emailInfoRow('Phone', emailPhoneCell(phone)));
    if (street)  rows.push(emailInfoRow('Address', escapeHtml(street)));
    if (city)    rows.push(emailInfoRow('City / Town', escapeHtml(city)));
    if (region)  rows.push(emailInfoRow('Region', escapeHtml(region)));
    if (country) rows.push(emailInfoRow('Country', escapeHtml(country)));
    rows.push(emailInfoRow(
        'Delivery Fee',
        shippingFee > 0 ? `GH₵${shippingFee.toFixed(2)}` : '<span style="color:#6b7280;font-weight:500;">To be confirmed</span>'
    ));

    return `<h3 style="margin:24px 0 12px;color:#111827;font-size:16px;font-weight:700;">&#128666; Delivery Details</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:12px;overflow:hidden;margin:8px 0 20px;">
${rows.join('')}
</table>`;
}

/** Resolve customer phone from order row (top-level, shipping JSON, or metadata). */
function resolveOrderPhone(order: {
    phone?: string | null;
    shipping_address?: unknown;
    metadata?: { phone?: string } | null;
}): string {
    const fromShipping = shippingAddressObj(order)?.phone;
    const raw =
        (typeof order.phone === 'string' && order.phone.trim() ? order.phone : '') ||
        (typeof fromShipping === 'string' && fromShipping.trim() ? fromShipping : '') ||
        (typeof order.metadata?.phone === 'string' && order.metadata.phone.trim() ? order.metadata.phone : '');
    return raw.trim();
}

function emailPhoneCell(phone: string): string {
    if (!phone) {
        return '<span style="color:#9ca3af;font-weight:500;">Not provided</span>';
    }
    const safe = phone.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const telHref = phone.replace(/[^\d+]/g, '') || phone;
    return `<a href="tel:${telHref}" style="color:${BRAND.color};text-decoration:none;font-weight:600;">${safe}</a>`;
}

// Shipping notes block
function emailShippingNotes(notes: string[]): string {
    if (notes.length === 0) return '';
    return `<div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px 16px;margin:20px 0;">
<p style="font-weight:600;color:#92400e;margin:0 0 6px;font-size:13px;">&#9200; Shipping Notes</p>
${notes.map(n => `<p style="color:#78350f;margin:3px 0;font-size:13px;">${escapeHtml(n)}</p>`).join('')}
</div>`;
}

// Helper to mask sensitive data in logs
function maskPhone(phone: string): string {
    if (!phone || phone.length < 6) return '***';
    return phone.slice(0, 4) + '****' + phone.slice(-2);
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('[Email] RESEND_API_KEY not configured');
        return null;
    }
    try {
        const data = await resend.emails.send({
            from: EMAIL_FROM,
            to,
            subject,
            html,
        });
        console.log('[Email] Sent successfully to:', to.split('@')[0] + '@***');
        return data;
    } catch (error: any) {
        console.error('[Email] Failed:', error.message);
        return null;
    }
}

// Helper to format phone number for SMS
// Helper to format phone number for SMS
function formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters (including + for now)
    let cleaned = phone.replace(/\D/g, '');

    // If starts with 0 (e.g. 024...), replace 0 with 233
    if (cleaned.startsWith('0')) {
        cleaned = '233' + cleaned.substring(1);
    }

    // If length is 9 (e.g. 24...), prepend 233
    if (cleaned.length === 9) {
        cleaned = '233' + cleaned;
    }

    // Ensure it starts with correct country code before prepending +
    if (!cleaned.startsWith('233') && cleaned.length === 12) {
        // Assuming it's some other format, but if it starts with 233, it's fine.
    }

    // Return with + prefix as per E.164
    return '+' + cleaned;
}

export async function sendSMS({ to, message }: { to: string; message: string }) {
    // Moolre SMS API only requires X-API-VASKEY header for authentication
    // See: https://docs.moolre.com/#/send-sms
    // Allow MOOLRE_SMS_API_KEY or fall back to MOOLRE_API_KEY
    const smsVasKey = process.env.MOOLRE_SMS_API_KEY || process.env.MOOLRE_API_KEY;

    if (!smsVasKey) {
        console.warn('[SMS] Missing MOOLRE_SMS_API_KEY or MOOLRE_API_KEY');
        return null;
    }

    const recipient = formatPhoneNumber(to);

    try {
        console.log(`[SMS] Sending to ${maskPhone(recipient)}`);
        const response = await fetch('https://api.moolre.com/open/sms/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-VASKEY': smsVasKey
            },
            body: JSON.stringify({
                type: 1,
                senderid: SMS_SENDER_ID,
                messages: [
                    {
                        recipient: recipient,
                        message: message
                    }
                ]
            })
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            console.error('[SMS] Non-JSON response:', text.slice(0, 200));
            return { status: 0, error: text.slice(0, 200) };
        }

        const result = await response.json();
        console.log('[SMS] Result:', result.status === 1 ? 'Success' : 'Failed', '| Code:', result.code);
        if (result.status !== 1) {
            console.log('[SMS] Full Response:', JSON.stringify(result, null, 2));
        }
        return result;
    } catch (error: any) {
        console.error('[SMS] Error:', error.message);
        return null;
    }
}

export async function sendOrderConfirmation(order: any) {
    const { id, email, shipping_address, total, created_at, order_number, metadata } = order;

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

    // Build customer name from available sources
    const getName = () => {
        // Try shipping_address first
        if (shipping_address?.full_name) return shipping_address.full_name;
        if (shipping_address?.firstName) {
            return shipping_address.lastName
                ? `${shipping_address.firstName} ${shipping_address.lastName}`
                : shipping_address.firstName;
        }
        // Fall back to metadata
        if (metadata?.first_name) {
            return metadata.last_name
                ? `${metadata.first_name} ${metadata.last_name}`
                : metadata.first_name;
        }
        return 'Customer';
    };
    const name = getName();

    const phone = resolveOrderPhone(order);

    // Get tracking number from metadata
    const trackingNumber = metadata?.tracking_number || '';
    const trackingUrl = `${baseUrl}/order-success?order=${order_number || id}`;

    console.log(`[Notification] Preparing for Order #${order_number} | Phone: ${phone ? 'Present' : 'Missing'} | Tracking: ${trackingNumber || 'None'}`);

    // Fetch order items (used for product list in admin email + shipping notes)
    let shippingNotes: string[] = [];
    let orderItems: any[] = [];
    try {
        const { data: items } = await supabaseAdmin
            .from('order_items')
            .select('product_name, variant_name, quantity, unit_price, total_price, metadata')
            .eq('order_id', id);
        if (items) {
            orderItems = items;
            for (const item of items) {
                const preorder = item.metadata?.preorder_shipping;
                if (preorder) {
                    shippingNotes.push(`${item.product_name}: ${preorder}`);
                }
            }
        }
    } catch (err) {
        console.warn('[Notification] Could not fetch order items for shipping notes');
    }

    const shippingNotesSms = shippingNotes.length > 0
        ? ` Note: ${shippingNotes.join('; ')}.`
        : '';

    // 1. Email to Customer
    const customerEmailHtml = emailLayout(`
<div style="text-align:center;margin-bottom:24px;">
  <div style="width:64px;height:64px;background-color:${BRAND.colorLight};border-radius:50%;margin:0 auto 16px;line-height:64px;font-size:28px;">&#10003;</div>
  <h2 style="margin:0 0 4px;color:#111827;font-size:24px;">Order Confirmed!</h2>
  <p style="margin:0;color:#6b7280;font-size:15px;">Thank you for your purchase, ${escapeHtml(name)}.</p>
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:12px;overflow:hidden;margin:20px 0;">
  ${emailInfoRow('Order Number', `#${order_number || id}`)}
  ${emailInfoRow('Order Date', new Date(created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}
  ${emailInfoRow('Contact phone', emailPhoneCell(phone))}
  ${trackingNumber ? emailInfoRow('Tracking', escapeHtml(trackingNumber)) : ''}
  ${emailInfoRow('Total', `GH₵${Number(total).toFixed(2)}`)}
</table>

${emailDeliveryDetails(order)}

${emailShippingNotes(shippingNotes)}

<p style="color:#374151;font-size:14px;line-height:1.6;margin:16px 0;">We're getting your order ready. You'll receive updates as it's processed and packaged.</p>

${emailButton('Track Your Order', trackingUrl)}

<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">Or copy this link: <a href="${trackingUrl}" style="color:${BRAND.color};">${trackingUrl}</a></p>
`, `Your order #${order_number || id} is confirmed!`);

    await sendEmail({
        to: email,
        subject: `Order Confirmed! #${order_number || id}`,
        html: customerEmailHtml
    });

    // 2. Email to Admin
    const adminItemsHtml = orderItems.length > 0 ? `
<h3 style="margin:24px 0 12px;color:#111827;font-size:16px;font-weight:700;">Items Ordered (${orderItems.length})</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
  <tr style="background-color:#f3f4f6;">
    <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;" colspan="2">Product</td>
    <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Qty</td>
    <td style="padding:10px 14px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Price</td>
  </tr>
  ${orderItems.map((item: any) => {
    const rawImg: string = item.metadata?.image || '';
    // Only allow http(s) or site-relative images; reject javascript:/data: etc.
    const isSafeImg = /^https?:\/\//i.test(rawImg) || rawImg.startsWith('/');
    const imgSrc = isSafeImg
        ? (rawImg.startsWith('http') ? rawImg : `${baseUrl}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`)
        : '';
    const variantLabel = item.variant_name ? `<br><span style="color:#9ca3af;font-size:11px;">${escapeHtml(item.variant_name)}</span>` : '';
    const imgCell = imgSrc
        ? `<img src="${escapeHtml(imgSrc)}" width="52" height="52" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:8px;display:block;">`
        : `<div style="width:52px;height:52px;background-color:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;">&#128247;</div>`;
    return `<tr style="border-top:1px solid #e5e7eb;">
      <td style="padding:12px 10px 12px 14px;width:64px;vertical-align:top;">${imgCell}</td>
      <td style="padding:12px 4px;vertical-align:middle;">
        <span style="color:#111827;font-size:13px;font-weight:600;">${escapeHtml(item.product_name)}</span>${variantLabel}
      </td>
      <td style="padding:12px 14px;text-align:center;vertical-align:middle;color:#374151;font-size:14px;font-weight:600;">×${item.quantity}</td>
      <td style="padding:12px 14px;text-align:right;vertical-align:middle;color:#111827;font-size:14px;font-weight:700;white-space:nowrap;">GH₵${Number(item.total_price).toFixed(2)}</td>
    </tr>`;
  }).join('')}
  <tr style="background-color:#f9fafb;border-top:2px solid #e5e7eb;">
    <td colspan="3" style="padding:12px 14px;font-size:14px;font-weight:700;color:#374151;text-align:right;">Order Total</td>
    <td style="padding:12px 14px;font-size:16px;font-weight:800;color:${BRAND.color};text-align:right;white-space:nowrap;">GH₵${Number(total).toFixed(2)}</td>
  </tr>
</table>` : '';

    const adminEmailHtml = emailLayout(`
<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">&#128230; New Order Received</h2>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:12px;overflow:hidden;margin:16px 0;">
  ${emailInfoRow('Order', `#${order_number || id}`)}
  ${emailInfoRow('Customer', `${escapeHtml(name)}`)}
  ${emailInfoRow('Email', escapeHtml(email))}
  ${emailInfoRow('Phone', emailPhoneCell(phone))}
  ${trackingNumber ? emailInfoRow('Tracking', escapeHtml(trackingNumber)) : ''}
</table>

${emailDeliveryDetails(order)}

${adminItemsHtml}

${emailShippingNotes(shippingNotes)}

${emailButton('View Order in Admin', `${baseUrl}/admin/orders/${id}`)}
`, `New order #${order_number} from ${escapeHtml(name)}`);

    await sendEmail({
        to: ADMIN_EMAIL,
        subject: `New Order #${order_number || id}`,
        html: adminEmailHtml
    });

    // 3. SMS to Customer (if phone exists)
    if (phone) {
        const addressLine = deliveryAddressLine(order);
        const methodLabel = deliveryMethodLabel(order.shipping_method);
        const deliverySms = addressLine
            ? ` Delivery: ${methodLabel} to ${addressLine}.`
            : ` Delivery: ${methodLabel}.`;
        const smsMessage = trackingNumber
            ? `Hi ${name}, your order #${order_number || id} is confirmed! Tracking: ${trackingNumber}. Track here: ${trackingUrl}${deliverySms}${shippingNotesSms}`
            : `Hi ${name}, your order #${order_number || id} at ${BRAND.name} is confirmed! Track here: ${trackingUrl}${deliverySms}${shippingNotesSms}`;

        await sendSMS({
            to: phone,
            message: smsMessage
        });
    }
}

export async function sendOrderStatusUpdate(order: any, newStatus: string) {
    const { id, email, shipping_address, order_number, metadata } = order;

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

    // Build customer name from available sources
    const getName = () => {
        if (shipping_address?.full_name) return shipping_address.full_name;
        if (shipping_address?.firstName) {
            return shipping_address.lastName
                ? `${shipping_address.firstName} ${shipping_address.lastName}`
                : shipping_address.firstName;
        }
        if (metadata?.first_name) {
            return metadata.last_name
                ? `${metadata.first_name} ${metadata.last_name}`
                : metadata.first_name;
        }
        return 'Customer';
    };
    const name = getName();
    const phone = resolveOrderPhone(order);
    const trackingNumber = metadata?.tracking_number || '';
    const trackingUrl = `${baseUrl}/order-success?order=${order_number || id}`;

    console.log(`[Notification] Status update for Order #${order_number} to ${newStatus} | Tracking: ${trackingNumber}`);

    const subject = `Order Update #${order_number || id}`;
    let message = `Your order #${order_number || id} status has been updated to ${newStatus}.`;
    let smsMessage = message;

    if (newStatus === 'shipped') {
        message = `Good news! Your order #${order_number || id} has been packaged and is ready.`;
        smsMessage = trackingNumber
            ? `Good news ${name}! Order #${order_number || id} has been packaged. Tracking: ${trackingNumber}. Track: ${trackingUrl}`
            : `Good news ${name}! Order #${order_number || id} has been packaged. Track: ${trackingUrl}`;
    } else if (newStatus === 'delivered') {
        message = `Your order #${order_number || id} has been delivered. Enjoy!`;
        smsMessage = `Hi ${name}, your order #${order_number || id} has been delivered. Enjoy your purchase!`;
    } else if (newStatus === 'processing') {
        smsMessage = trackingNumber
            ? `Hi ${name}, your order #${order_number || id} is being processed. Tracking: ${trackingNumber}. Track: ${trackingUrl}`
            : `Hi ${name}, your order #${order_number || id} is being processed. Track: ${trackingUrl}`;
    } else {
        smsMessage = `Hi ${name}, order #${order_number || id} status: ${newStatus}. Track: ${trackingUrl}`;
    }

    // Status icons/colors
    const statusConfig: Record<string, { icon: string; color: string; bg: string }> = {
        processing: { icon: '&#9881;', color: '#2563eb', bg: '#eff6ff' },
        shipped: { icon: '&#128666;', color: '#374151', bg: '#f3f4f6' },
        delivered: { icon: '&#127881;', color: '#16a34a', bg: '#f0fdf4' },
        cancelled: { icon: '&#10060;', color: '#dc2626', bg: '#fef2f2' },
    };
    const sc = statusConfig[newStatus] || { icon: '&#128276;', color: '#6b7280', bg: '#f9fafb' };

    await sendEmail({
        to: email,
        subject: subject,
        html: emailLayout(`
<div style="text-align:center;margin-bottom:24px;">
  <div style="width:64px;height:64px;background-color:${sc.bg};border-radius:50%;margin:0 auto 16px;line-height:64px;font-size:28px;">${sc.icon}</div>
  <h2 style="margin:0 0 4px;color:#111827;font-size:22px;">Order Update</h2>
  <p style="margin:0;color:#6b7280;font-size:14px;">Hi ${escapeHtml(name)}, here's an update on your order.</p>
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:12px;overflow:hidden;margin:20px 0;">
  ${emailInfoRow('Order Number', `#${order_number || id}`)}
  ${emailInfoRow('New Status', `<span style="display:inline-block;background-color:${sc.bg};color:${sc.color};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;">${newStatus}</span>`)}
  ${trackingNumber ? emailInfoRow('Tracking Number', escapeHtml(trackingNumber)) : ''}
</table>

<p style="color:#374151;font-size:14px;line-height:1.6;margin:16px 0;">${message}</p>

${emailButton('Track Your Order', trackingUrl)}
`, `Your order #${order_number} is now ${newStatus}`)
    });

    // SMS
    if (phone) {
        await sendSMS({
            to: phone,
            message: smsMessage
        });
    }
}

export async function sendWelcomeMessage(user: { email: string, firstName: string, phone?: string }) {
    const { email, firstName, phone } = user;

    // Email
    await sendEmail({
        to: email,
        subject: `Welcome to ${BRAND.name}!`,
        html: emailLayout(`
<div style="text-align:center;margin-bottom:24px;">
  <div style="width:64px;height:64px;background-color:${BRAND.colorLight};border-radius:50%;margin:0 auto 16px;line-height:64px;font-size:28px;">&#128075;</div>
  <h2 style="margin:0 0 4px;color:#111827;font-size:24px;">Welcome, ${escapeHtml(firstName)}!</h2>
  <p style="margin:0;color:#6b7280;font-size:15px;">We're so glad you're here.</p>
</div>

<p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">Thank you for joining the ${BRAND.name} family. We source high-quality products directly from China and deliver them safely across Ghana &mdash; simple, reliable, and affordable for individuals and businesses alike.</p>

<div style="background-color:#f9fafb;border-radius:12px;padding:20px;margin:20px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="text-align:center;padding:8px;width:33%;">
        <p style="font-size:20px;margin:0 0 4px;">&#128666;</p>
        <p style="color:#374151;font-size:12px;font-weight:600;margin:0;">Genuine Products</p>
        <p style="color:#9ca3af;font-size:11px;margin:2px 0 0;">Directly sourced</p>
      </td>
      <td style="text-align:center;padding:8px;width:33%;">
        <p style="font-size:20px;margin:0 0 4px;">&#9989;</p>
        <p style="color:#374151;font-size:12px;font-weight:600;margin:0;">Quality Assured</p>
        <p style="color:#9ca3af;font-size:11px;margin:2px 0 0;">Verified imports</p>
      </td>
      <td style="text-align:center;padding:8px;width:33%;">
        <p style="font-size:20px;margin:0 0 4px;">&#128176;</p>
        <p style="color:#374151;font-size:12px;font-weight:600;margin:0;">Competitive Prices</p>
        <p style="color:#9ca3af;font-size:11px;margin:2px 0 0;">No overpaying</p>
      </td>
    </tr>
  </table>
</div>

${emailButton('Start Shopping', `${BRAND.url}/shop`)}
`, `Welcome to ${BRAND.name}, ${escapeHtml(firstName)}!`)
    });

    // SMS
    if (phone) {
        await sendSMS({
            to: phone,
            message: `Welcome ${firstName}! Thanks for joining ${BRAND.name}.`
        });
    }
}

export async function sendPaymentLink(order: any) {
    const { id, email, shipping_address, total, order_number, metadata } = order;

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const paymentUrl = `${baseUrl}/pay/${id}`;

    // Build customer name from available sources
    const getName = () => {
        if (shipping_address?.full_name) return shipping_address.full_name;
        if (shipping_address?.firstName) {
            return shipping_address.lastName
                ? `${shipping_address.firstName} ${shipping_address.lastName}`
                : shipping_address.firstName;
        }
        if (metadata?.first_name) {
            return metadata.last_name
                ? `${metadata.first_name} ${metadata.last_name}`
                : metadata.first_name;
        }
        return 'Customer';
    };
    const name = getName();
    const phone = resolveOrderPhone(order);

    console.log(`[Notification] Sending payment link for Order #${order_number} | Phone: ${phone ? 'Present' : 'Missing'}`);

    // Email with payment link
    await sendEmail({
        to: email,
        subject: `Complete Your Order #${order_number}`,
        html: emailLayout(`
<div style="text-align:center;margin-bottom:24px;">
  <div style="width:64px;height:64px;background-color:#fef3c7;border-radius:50%;margin:0 auto 16px;line-height:64px;font-size:28px;">&#128179;</div>
  <h2 style="margin:0 0 4px;color:#111827;font-size:22px;">Complete Your Order</h2>
  <p style="margin:0;color:#6b7280;font-size:14px;">Hi ${escapeHtml(name)}, your order is waiting for payment.</p>
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:12px;overflow:hidden;margin:20px 0;">
  ${emailInfoRow('Order Number', `#${order_number}`)}
  ${emailInfoRow('Amount Due', `<span style="color:${BRAND.color};font-size:18px;font-weight:700;">GH₵${Number(total).toFixed(2)}</span>`)}
</table>

<p style="color:#374151;font-size:14px;line-height:1.6;margin:16px 0;">Click the button below to securely complete your payment. This link will remain active until your order is completed or cancelled.</p>

${emailButton('Pay Now — GH₵' + Number(total).toFixed(2), paymentUrl, '#d97706')}

<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">Or copy this link: <a href="${paymentUrl}" style="color:${BRAND.color};">${paymentUrl}</a></p>
`, `Complete payment for order #${order_number}`)
    });

    // SMS with payment link
    if (phone) {
        const smsMessage = `Hi ${name}, complete your order #${order_number} (GH₵${Number(total).toFixed(2)}) here: ${paymentUrl}`;

        await sendSMS({
            to: phone,
            message: smsMessage
        });
    }
}

export async function sendContactMessage(data: { name: string, email: string, subject: string, message: string }) {
    const { name, email, subject, message } = data;

    // Escape all user-supplied fields before embedding in HTML emails to
    // prevent HTML/script injection into the recipient's (and admin's) mailbox.
    const safeName = escapeHtml(name);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
    const safeEmail = escapeHtml(email);
    const mailtoHref = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Re: ' + subject)}`;

    // 1. Acknowledge to User
    await sendEmail({
        to: email,
        subject: `We received your message: ${subject}`,
        html: emailLayout(`
<div style="text-align:center;margin-bottom:24px;">
  <div style="width:64px;height:64px;background-color:${BRAND.colorLight};border-radius:50%;margin:0 auto 16px;line-height:64px;font-size:28px;">&#128172;</div>
  <h2 style="margin:0 0 4px;color:#111827;font-size:22px;">Message Received</h2>
  <p style="margin:0;color:#6b7280;font-size:14px;">We'll get back to you soon.</p>
</div>

<p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">Hi ${safeName},</p>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">Thank you for reaching out to ${BRAND.name}. We've received your message regarding <strong>"${safeSubject}"</strong> and our team will respond as soon as possible.</p>

<div style="background-color:#f9fafb;border-left:4px solid ${BRAND.color};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
  <p style="color:#6b7280;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Your message</p>
  <p style="color:#374151;font-size:14px;margin:0;line-height:1.6;">${safeMessage}</p>
</div>

<p style="color:#6b7280;font-size:13px;margin:16px 0 0;">We typically respond within 24 hours.</p>
`, `Thanks for contacting us, ${safeName}`)
    });

    // 2. Alert Admin
    await sendEmail({
        to: ADMIN_EMAIL,
        subject: `Contact: ${subject}`,
        html: emailLayout(`
<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">&#128233; New Contact Message</h2>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:12px;overflow:hidden;margin:16px 0;">
  ${emailInfoRow('From', safeName)}
  ${emailInfoRow('Email', `<a href="${mailtoHref}" style="color:${BRAND.color};">${safeEmail}</a>`)}
  ${emailInfoRow('Subject', safeSubject)}
</table>

<div style="background-color:#f9fafb;border-left:4px solid ${BRAND.color};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
  <p style="color:#6b7280;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Message</p>
  <p style="color:#374151;font-size:14px;margin:0;line-height:1.6;">${safeMessage}</p>
</div>

${emailButton('Reply to ' + safeName, mailtoHref)}
`, `New contact from ${safeName}: ${safeSubject}`)
    });
}

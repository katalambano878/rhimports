/** Display-only masking for contact details returned by public order routes. */

export function maskEmail(email: unknown): string | null {
    if (typeof email !== 'string' || !email.includes('@')) return null;
    const [local, domain] = email.trim().split('@');
    if (!local || !domain) return null;
    const head = local.slice(0, Math.min(2, local.length));
    return `${head}${'*'.repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

export function maskPhone(phone: unknown): string | null {
    const digits = String(phone || '').replace(/\D+/g, '');
    if (digits.length < 4) return null;
    return `${'*'.repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}

/** Placeholder till addresses are never shown as if they were the customer's. */
export function isPlaceholder(email: unknown): boolean {
    return typeof email === 'string' && /@(pos|store)\.local$/i.test(email.trim());
}

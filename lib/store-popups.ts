export type StorePopupKind = 'fashion' | 'preorder';

const LAST_KEY = 'rnh-popup-last-kind';
const SESSION_KEY = 'rnh-popup-shown-this-session';
const FASHION_SEEN_KEY = 'rnh-fashion-popup-seen';

/** First visit always shows Fashion. Later visits alternate with the preorder notice. */
export function nextStorePopup(): StorePopupKind | null {
  if (typeof window === 'undefined') return null;

  try {
    if (sessionStorage.getItem(SESSION_KEY)) return null;

    const fashionSeen = localStorage.getItem(FASHION_SEEN_KEY);
    if (!fashionSeen) return 'fashion';

    const last = localStorage.getItem(LAST_KEY);
    return last === 'fashion' ? 'preorder' : 'fashion';
  } catch {
    return 'fashion';
  }
}

export function markStorePopupShown(kind: StorePopupKind): void {
  try {
    sessionStorage.setItem(SESSION_KEY, kind);
    localStorage.setItem(LAST_KEY, kind);
    if (kind === 'fashion') localStorage.setItem(FASHION_SEEN_KEY, String(Date.now()));
  } catch {
    /* ignore quota / private mode */
  }
}

export function shouldSkipFashionPopup(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/fashion')) return true;
  if (pathname.startsWith('/checkout')) return true;
  if (pathname.startsWith('/pay')) return true;
  if (pathname.startsWith('/auth')) return true;
  if (pathname.startsWith('/admin')) return true;
  return false;
}

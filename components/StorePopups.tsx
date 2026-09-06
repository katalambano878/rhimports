'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import FashionPopup from '@/components/FashionPopup';
import PreorderPopup from '@/components/PreorderPopup';
import {
  markStorePopupShown,
  nextStorePopup,
  shouldSkipFashionPopup,
  type StorePopupKind,
} from '@/lib/store-popups';

export default function StorePopups() {
  const pathname = usePathname();
  const [kind, setKind] = useState<StorePopupKind | null>(null);

  useEffect(() => {
    let next = nextStorePopup();
    if (next === 'fashion' && shouldSkipFashionPopup(pathname)) {
      next = null;
    }
    if (next === 'preorder' && pathname?.startsWith('/checkout')) {
      next = null;
    }
    setKind(next);
  }, [pathname]);

  const dismiss = (shown: StorePopupKind) => {
    markStorePopupShown(shown);
    setKind(null);
  };

  if (kind === 'fashion') return <FashionPopup onDismiss={() => dismiss('fashion')} />;
  if (kind === 'preorder') return <PreorderPopup onDismiss={() => dismiss('preorder')} />;
  return null;
}

import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/I18nProvider';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdFormat = 'banner' | 'infeed' | 'sidebar';

interface AdSlotProps {
  slot?: string;
  format?: AdFormat;
  className?: string;
}

const CLIENT =
  (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() ||
  'ca-pub-5737689254964633';

let scriptLoading: Promise<void> | null = null;

function loadAdSense(): Promise<void> {
  if (!CLIENT || typeof document === 'undefined') return Promise.resolve();
  // Already present in index.html (or previously injected)
  if (
    document.querySelector('script[data-vamoos-adsense]') ||
    document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')
  ) {
    return Promise.resolve();
  }
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
    s.crossOrigin = 'anonymous';
    s.dataset.vamoosAdsense = '1';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return scriptLoading;
}

/**
 * Google AdSense slot. Set VITE_ADSENSE_CLIENT + slot ids in env to go live.
 * Without credentials, shows a labeled placeholder so layout/revenue spots stay ready.
 */
export function AdSlot({ slot, format = 'banner', className = '' }: AdSlotProps) {
  const { t } = useI18n();
  const pushed = useRef(false);
  const slotId =
    slot ||
    (format === 'infeed'
      ? (import.meta.env.VITE_ADSENSE_SLOT_INFEED as string | undefined)?.trim()
      : format === 'sidebar'
        ? (import.meta.env.VITE_ADSENSE_SLOT_SIDEBAR as string | undefined)?.trim()
        : (import.meta.env.VITE_ADSENSE_SLOT_BANNER as string | undefined)?.trim()) ||
    '';

  const live = Boolean(CLIENT && slotId);

  useEffect(() => {
    if (!live || pushed.current) return;
    let cancelled = false;
    void loadAdSense().then(() => {
      if (cancelled || pushed.current) return;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushed.current = true;
      } catch {
        /* AdSense may throw if blocked */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [live]);

  if (live) {
    return (
      <aside className={`ad-slot ad-slot--${format} ${className}`.trim()} aria-label={t('adLabel')}>
        <span className="ad-slot__label">{t('adLabel')}</span>
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={CLIENT}
          data-ad-slot={slotId}
          data-ad-format={format === 'banner' ? 'horizontal' : 'auto'}
          data-full-width-responsive="true"
        />
      </aside>
    );
  }

  return (
    <aside className={`ad-slot ad-slot--${format} ad-slot--placeholder ${className}`.trim()}>
      <span className="ad-slot__label">{t('adLabel')}</span>
      <p className="ad-slot__placeholder-text">VAMOOS · {t('adLabel')}</p>
    </aside>
  );
}

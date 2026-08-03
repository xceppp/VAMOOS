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

/** Display ad — Bloc A */
const SLOT_BANNER =
  (import.meta.env.VITE_ADSENSE_SLOT_BANNER as string | undefined)?.trim() || '1197219480';

/** In-feed / fluid ad */
const SLOT_INFEED =
  (import.meta.env.VITE_ADSENSE_SLOT_INFEED as string | undefined)?.trim() || '8417233953';

const INFEED_LAYOUT_KEY =
  (import.meta.env.VITE_ADSENSE_LAYOUT_KEY_INFEED as string | undefined)?.trim() ||
  '-fb+5w+4e-db+86';

const SLOT_SIDEBAR =
  (import.meta.env.VITE_ADSENSE_SLOT_SIDEBAR as string | undefined)?.trim() || SLOT_BANNER;

let scriptLoading: Promise<void> | null = null;

function loadAdSense(): Promise<void> {
  if (!CLIENT || typeof document === 'undefined') return Promise.resolve();
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

function slotFor(format: AdFormat, override?: string): string {
  if (override?.trim()) return override.trim();
  if (format === 'infeed') return SLOT_INFEED;
  if (format === 'sidebar') return SLOT_SIDEBAR;
  return SLOT_BANNER;
}

/**
 * Live AdSense units:
 * - banner / sidebar → auto display (slot 1197219480)
 * - infeed → fluid in-article (slot 8417233953)
 */
export function AdSlot({ slot, format = 'banner', className = '' }: AdSlotProps) {
  const { t } = useI18n();
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);
  const slotId = slotFor(format, slot);
  const live = Boolean(CLIENT && slotId);

  useEffect(() => {
    if (!live || pushed.current) return;
    let cancelled = false;

    void loadAdSense().then(() => {
      if (cancelled || pushed.current) return;
      const el = insRef.current;
      // Avoid double-fill (React StrictMode / remount)
      if (el?.getAttribute('data-adsbygoogle-status')) {
        pushed.current = true;
        return;
      }
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushed.current = true;
      } catch {
        /* AdSense may throw if blocked or already filled */
      }
    });

    return () => {
      cancelled = true;
    };
  }, [live, slotId, format]);

  if (!live) return null;

  const isInfeed = format === 'infeed';

  return (
    <aside className={`ad-slot ad-slot--${format} ${className}`.trim()} aria-label={t('adLabel')}>
      <span className="ad-slot__label">{t('adLabel')}</span>
      {isInfeed ? (
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-format="fluid"
          data-ad-layout-key={INFEED_LAYOUT_KEY}
          data-ad-client={CLIENT}
          data-ad-slot={slotId}
        />
      ) : (
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={CLIENT}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </aside>
  );
}

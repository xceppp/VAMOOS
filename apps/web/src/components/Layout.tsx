import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../theme/ThemeProvider';
import { AdSlot } from './AdSlot';
import { TabNav, type TabItem } from './TabNav';

interface LayoutProps {
  children: ReactNode;
  mode: string;
  connected: boolean;
  rateLimited?: boolean;
  notice?: string | null;
}

export function Layout({ children, mode, connected, rateLimited, notice }: LayoutProps) {
  const { t, toggleLang } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const tabs: TabItem[] = [
    { to: '/', label: t('navLive'), short: t('navLiveShort'), end: true },
    { to: '/upcoming', label: t('navUpcoming'), short: t('navUpcomingShort') },
    { to: '/favorites', label: t('navFavorites'), short: t('navFavoritesShort') },
    { to: '/predictions', label: t('navPredictions'), short: t('navPredictionsShort') },
    { to: '/notify', label: t('navSettings'), short: t('navSettingsShort') },
  ];

  const modeLabel =
    mode === 'demo'
      ? t('demo')
      : mode === 'connecting'
        ? t('connecting')
        : mode === 'live'
          ? t('connected')
          : mode;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">{t('brand')}</span>
          <span className="brand__sub">{t('brandSub')}</span>
        </div>
        <div className="topbar__end">
          <button type="button" className="lang-toggle" onClick={toggleLang} aria-label={t('langSwitch')}>
            {t('langSwitch')}
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
          >
            {theme === 'dark' ? t('themeLight') : t('themeDark')}
          </button>
          <div className="conn">
            <span className={`dot${connected ? (rateLimited ? ' dot--warn' : ' dot--on') : ''}`} />
            <span className="conn__text">
              {connected ? (rateLimited ? t('limited') : modeLabel) : t('reconnecting')}
            </span>
          </div>
        </div>
      </header>

      <TabNav items={tabs} />

      <AdSlot format="banner" className="ad-slot--top" />
      {notice ? (
        <div className={`notice-banner${rateLimited ? ' notice-banner--warn' : ''}`}>{notice}</div>
      ) : null}
      <main className="main">{children}</main>
    </div>
  );
}

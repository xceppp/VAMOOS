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
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const tabs: TabItem[] = [
    { to: '/', label: t('navLive'), short: t('navLiveShort'), end: true },
    { to: '/predictions', label: t('navPredictions'), short: t('navPredictionsShort') },
    { to: '/favorites', label: t('navFavorites'), short: t('navFavoritesShort') },
    { to: '/upcoming', label: t('navUpcoming'), short: t('navUpcomingShort') },
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
        <div className="logo">
          <div className="logo-mark" aria-hidden>
            <i className="ti ti-ball-football" />
          </div>
          <span className="logo-text">{t('brand')}</span>
        </div>

        <div className="header-right">
          <div className="lang-toggle" role="group" aria-label={t('langSwitch')}>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={lang === 'ar' ? 'active' : ''}
              onClick={() => setLang('ar')}
            >
              AR
            </button>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
          >
            <i className={theme === 'dark' ? 'ti ti-moon' : 'ti ti-sun'} aria-hidden />
          </button>

          <div className="conn" title={connected ? modeLabel : t('reconnecting')}>
            <span className={`dot${connected ? (rateLimited ? ' dot--warn' : ' dot--on') : ''}`} />
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

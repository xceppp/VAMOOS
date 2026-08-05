import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../theme/ThemeProvider';
import { SiteFooter } from './SiteFooter';
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

  const showLiveChip = connected && (mode === 'live' || mode === 'demo');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo">
          <span className="logo-text">
            VAMOOS<span className="logo-dot">.</span>
          </span>
          {/* TODO: needs liveMatchCount — chip shows presence only until Layout receives a count */}
          {showLiveChip ? (
            <span className="live-chip" title={modeLabel}>
              <span className="live-dot" aria-hidden />
              {t('liveChip')}
            </span>
          ) : null}
        </div>

        <div className="header-right">
          <div className="lang-toggle" role="group" aria-label={t('langSwitch')}>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              onClick={() => setLang('en')}
            >
              {t('langEn')}
            </button>
            <button
              type="button"
              className={lang === 'ar' ? 'active' : ''}
              onClick={() => setLang('ar')}
            >
              {t('langDarija')}
            </button>
          </div>

          <button
            type="button"
            className="icon-btn theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dusk' ? t('themeDay') : t('themeDusk')}
            title={theme === 'dusk' ? t('themeDay') : t('themeDusk')}
          >
            <i className={theme === 'dusk' ? 'ti ti-sun' : 'ti ti-moon'} aria-hidden />
          </button>

          {/* TODO: needs user avatar — no accounts in app today */}

          <div className="conn" title={connected ? modeLabel : t('reconnecting')}>
            <span className={`dot${connected ? (rateLimited ? ' dot--warn' : ' dot--on') : ''}`} />
          </div>
        </div>
      </header>

      <div className="shell-body">
        <aside className="shell-rail">
          <TabNav items={tabs} />
        </aside>

        <div className="shell-main">
          {notice && rateLimited ? (
            <div className="notice-banner notice-banner--warn">{notice}</div>
          ) : null}
          <main className="main">{children}</main>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { AdSlot } from './AdSlot';

interface LayoutProps {
  children: ReactNode;
  mode: string;
  connected: boolean;
  rateLimited?: boolean;
  notice?: string | null;
}

export function Layout({ children, mode, connected, rateLimited, notice }: LayoutProps) {
  const { t, toggleLang, lang } = useI18n();

  const links = [
    { to: '/', label: t('navLive'), short: t('navLiveShort'), end: true as const },
    { to: '/leagues', label: t('navLeagues'), short: t('navLeaguesShort') },
    { to: '/favorites', label: t('navFavorites'), short: t('navFavoritesShort') },
    { to: '/upcoming', label: t('navUpcoming'), short: t('navUpcomingShort') },
    { to: '/predictions', label: t('navPredictions'), short: t('navPredictionsShort') },
    { to: '/notify', label: t('navNotify'), short: t('navNotifyShort') },
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
      <div className="ambient" aria-hidden />
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">{t('brand')}</span>
          <span className="brand__sub">{t('brandSub')}</span>
        </div>
        <nav className="nav" aria-label="Primary">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={'end' in link ? link.end : undefined}>
              <span className="nav__full">{link.label}</span>
              <span className="nav__short">{link.short}</span>
            </NavLink>
          ))}
        </nav>
        <div className="topbar__end">
          <button type="button" className="lang-toggle" onClick={toggleLang} aria-label={t('langSwitch')}>
            {t('langSwitch')}
          </button>
          <div className="conn">
            <span className={`dot${connected ? (rateLimited ? ' dot--warn' : ' dot--on') : ''}`} />
            <span className="conn__text">
              {connected ? (rateLimited ? t('limited') : modeLabel) : t('reconnecting')}
            </span>
          </div>
        </div>
      </header>
      <AdSlot format="banner" className="ad-slot--top" />
      {notice ? (
        <div className={`notice-banner${rateLimited ? ' notice-banner--warn' : ''}`}>{notice}</div>
      ) : null}
      <main className="main">{children}</main>
      <span className="sr-only" data-lang={lang} />
    </div>
  );
}

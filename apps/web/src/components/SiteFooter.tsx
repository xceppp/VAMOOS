import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="site-footer">
      <nav className="site-footer__nav" aria-label={t('footerNav')}>
        <Link to="/about">{t('footerAbout')}</Link>
        <Link to="/how-predictions-work">{t('footerHow')}</Link>
        <Link to="/privacy">{t('footerPrivacy')}</Link>
      </nav>
      <p className="site-footer__copy">{t('footerCopy')}</p>
    </footer>
  );
}

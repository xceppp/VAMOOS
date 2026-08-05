import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="site-footer">
      <p className="site-footer__pill">{t('footerResponsible')}</p>
      <p className="site-footer__estimates">{t('footerEstimates')}</p>
      <nav className="site-footer__nav" aria-label={t('footerNav')}>
        <Link to="/how-predictions-work">{t('footerHow')}</Link>
        {/* TODO: needs dedicated support route — privacy is the closest existing page */}
        <Link to="/privacy">{t('footerSupport')}</Link>
        <Link to="/about">{t('footerAbout')}</Link>
      </nav>
      <p className="site-footer__copy">{t('footerCopy')}</p>
    </footer>
  );
}

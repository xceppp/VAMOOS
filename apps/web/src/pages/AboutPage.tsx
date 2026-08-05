import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export function AboutPage() {
  const { t } = useI18n();

  return (
    <section className="page page--narrow page--content">
      <Link to="/" className="back-link">
        {t('backLive')}
      </Link>

      <article className="content-article">
        <h1>{t('aboutTitle')}</h1>
        <p>{t('aboutP1')}</p>
        <p>{t('aboutP2')}</p>
        <p>{t('aboutP3')}</p>
        <h2>{t('aboutWhatTitle')}</h2>
        <ul>
          <li>{t('aboutWhatLive')}</li>
          <li>{t('aboutWhatPred')}</li>
          <li>{t('aboutWhatFav')}</li>
        </ul>
        <p>
          <Link to="/how-predictions-work">{t('footerHow')}</Link>
          {' · '}
          <Link to="/privacy">{t('footerPrivacy')}</Link>
        </p>
      </article>
    </section>
  );
}

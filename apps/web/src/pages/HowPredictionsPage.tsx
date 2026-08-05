import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export function HowPredictionsPage() {
  const { t } = useI18n();

  return (
    <section className="page page--narrow page--content">
      <Link to="/predictions" className="back-link">
        {t('howBackPred')}
      </Link>

      <article className="content-article">
        <h1>{t('howTitle')}</h1>
        <p>{t('howIntro')}</p>

        <h2>{t('howDcTitle')}</h2>
        <p>{t('howDcP1')}</p>
        <p>{t('howDcP2')}</p>

        <h2>{t('howMarketsTitle')}</h2>
        <ul>
          <li>{t('howMkt1x2')}</li>
          <li>{t('howMktGoals')}</li>
          <li>{t('howMktBtts')}</li>
          <li>{t('howMktLive')}</li>
        </ul>

        <h2>{t('howHeatTitle')}</h2>
        <p>{t('howHeatP')}</p>

        <h2>{t('howLimitTitle')}</h2>
        <p>{t('howLimitP')}</p>
        <p className="content-article__note">{t('predDisclaimer')}</p>

        <p>
          <Link to="/predictions">{t('navPredictions')}</Link>
          {' · '}
          <Link to="/about">{t('footerAbout')}</Link>
        </p>
      </article>
    </section>
  );
}
